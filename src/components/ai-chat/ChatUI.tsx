"use client";

import { CreditAlert } from "@/components/credits/CreditAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCredits } from "@/hooks/useCredits";
import { useSystemDesigner } from "@/lib/hooks/_useSystemDesigner";
import { useChatMessages } from "@/lib/hooks/useChatMessages_";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { type CustomEdge } from "@/types/system";
import { useAuth, useOrganization } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { type Edge } from "reactflow";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  isSystemDesignRelated: boolean;
}

interface ChatUIProps {
  challengeId?: string;
  stageIndex?: number;
  isPlayground?: boolean;
  playgroundId?: string;
  playgroundTitle?: string;
  playgroundDescription?: string;
}

interface WhiteboardConfigs {
  "API definitions and flows"?: Array<{
    name: string;
    definition: string;
    flow: string;
  }>;
  "Capacity estimations"?: {
    Traffic?: string;
    Storage?: string;
    Bandwidth?: string;
    Memory?: string;
  };
  "functional requirements"?: string;
  "non-functional requirements"?: string;
}

export const extractAPIDefinitions = (
  edges: CustomEdge[],
) => {
  return edges
    ?.filter(
      (edge) =>
        edge.data?.label &&
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        (edge.data?.apiDefinition || edge.data?.requestFlow),
    )
    .map((edge) => ({
      name: edge.data?.label ?? "",
      apiDefinition: edge.data?.apiDefinition ?? "",
      requestFlow: edge.data?.requestFlow ?? "",
      source: edge.source,
      target: edge.target,
    }));
};

export function ChatUI({
  challengeId,
  stageIndex = 0,
  isPlayground = false,
  playgroundId,
  playgroundTitle,
  playgroundDescription,
}: ChatUIProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [remainingMessages, setRemainingMessages] = useState(0);
  const [mounted, setMounted] = useState(false);

  const {
    expiringTokens,
    expiringTokensExpiry,
    nonexpiringTokens,
    totalUsableTokens: totalTokens,
    hasValidData: hasValidCreditData,
    refetch: refetchCredits,
  } = useCredits();
  const { getMessages, addMessage, clearSession } = useChatMessages();
  const { userId } = useAuth();
  const { organization } = useOrganization();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { nodes, edges } = useSystemDesigner();
  const queryClient = useQueryClient();

  // Track the previous organization ID to detect changes
  const prevOrgIdRef = useRef<string | null | undefined>();

  // Create a stable chat session ID that persists across component mounts
  const chatSessionId = useMemo(
    () => (isPlayground ? `playground:${playgroundId}` : `chat:${challengeId}`),
    [isPlayground, playgroundId, challengeId],
  );

  // Get remaining prompts on load with explicit timestamp to bust cache
  const { data: rateLimitInfo, refetch: refetchRemainingMessages } =
    api.chat.getRemainingPrompts.useQuery(
      {
        challengeId: isPlayground ? playgroundId ?? "" : challengeId ?? "",
        isPlayground,
        playgroundId,
      },
      {
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
        refetchOnWindowFocus: "always",
        refetchOnReconnect: "always",
        retry: (failureCount, error) => {
          if (
            error.message?.includes("401") ||
            error.message?.includes("UNAUTHORIZED")
          ) {
            return false;
          }
          return failureCount < 3;
        },
      },
    );

  const forceRefreshRemainingMessages = useCallback(() => {
    queryClient.removeQueries({
      queryKey: ["chat", "getRemainingPrompts"],
    });

    void refetchRemainingMessages();
  }, [refetchRemainingMessages, queryClient]);

  useEffect(() => {
    setMounted(true);

    if (userId && !hasValidCreditData) void refetchCredits();

    if (mounted) {
      forceRefreshRemainingMessages();
    }
  }, [
    userId,
    hasValidCreditData,
    refetchCredits,
    forceRefreshRemainingMessages,
    mounted,
  ]);

  // Watch for organization changes and refetch remaining prompts when context switches
  useEffect(() => {
    const currentOrgId = organization?.id ?? null;
    
    // Only refetch if the organization actually changed (not on initial mount)
    if (prevOrgIdRef.current !== undefined && prevOrgIdRef.current !== currentOrgId) {
      forceRefreshRemainingMessages();
    }
    
    // Update the ref to the current org ID
    prevOrgIdRef.current = currentOrgId;
  }, [organization?.id, forceRefreshRemainingMessages]);

  const messages = useMemo(
    () => (mounted ? getMessages(chatSessionId) : []),
    [mounted, getMessages, chatSessionId],
  );

  // Update remaining messages when rate limit info changes
  useEffect(() => {
    if (rateLimitInfo) {
      setRemainingMessages(rateLimitInfo.remaining);
    }
  }, [rateLimitInfo]);

  const hasRemainingFreePrompts = rateLimitInfo ? remainingMessages > 0 : false;
  const hasAvailablePrompts = hasRemainingFreePrompts || totalTokens > 0;

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = api.chat.sendMessage.useMutation({
    onSuccess: async (data) => {
      // Immediately set isLoading to false when we get a response
      setIsLoading(false);

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message,
        isSystemDesignRelated: data.isSystemDesignRelated ?? false,
      };

      // If the assistant's response contains the disclaimer, update the last user message
      if (!data.isSystemDesignRelated) {
        const currentMessages = getMessages(chatSessionId);
        const updatedMessages = currentMessages.map((msg, index) => {
          if (index === currentMessages.length - 1 && msg.role === "user") {
            return { ...msg, isSystemDesignRelated: false };
          }
          return msg;
        });

        // Clear and re-add all messages to maintain the updated state
        clearSession(chatSessionId);
        updatedMessages.forEach((msg) => addMessage(chatSessionId, msg));
      }

      addMessage(chatSessionId, assistantMessage);

      setRemainingMessages(data.remainingMessages);
      forceRefreshRemainingMessages();

      // If tokens were used, refetch balances
      if (data.tokensUsed !== null) {
        void refetchCredits();
      }
    },
    onError: (error) => {
      // Immediately set isLoading to false when we get an error
      setIsLoading(false);

      console.error("Chat error:", error);

      // Create a user-friendly error message based on the error type
      let errorContent = error.message;

      // Check for specific error messages like "stream closed"
      if (
        error.message.toLowerCase().includes("stream closed") ||
        error.message.toLowerCase().includes("network") ||
        error.message.toLowerCase().includes("connection")
      ) {
        errorContent =
          "The connection to the AI service was interrupted. Please try again.";
      }

      // Display error message to user
      const errorMessage: Message = {
        role: "system",
        content: errorContent,
        isSystemDesignRelated: false,
      };
      addMessage(chatSessionId, errorMessage);
    },
  });

  // Extract solution data
  const extractSolutionData = useCallback(() => {
    const whiteboardNode = nodes.find((node) => node.type === "Whiteboard");
    const configs =
      (whiteboardNode?.data.configs as WhiteboardConfigs | undefined) ?? {};

    const cleanedNodes = nodes
      .filter((node) => node.type !== "Whiteboard")
      .map((node) => ({
        type: node.data.name,
        id: node.id,
        configs: node.data.configs,
      }));

    const apiDefinitions = extractAPIDefinitions(edges);

    return {
      components: cleanedNodes,
      apiDefinitions,
      capacityEstimations: {
        traffic: configs["Capacity estimations"]?.Traffic ?? "",
        storage: configs["Capacity estimations"]?.Storage ?? "",
        bandwidth: configs["Capacity estimations"]?.Bandwidth ?? "",
        memory: configs["Capacity estimations"]?.Memory ?? "",
      },
      functionalRequirements: configs["functional requirements"] ?? "",
      nonFunctionalRequirements: configs["non-functional requirements"] ?? "",
      title: playgroundTitle,
      description: playgroundDescription,
    };
  }, [nodes, edges, playgroundTitle, playgroundDescription]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      isSystemDesignRelated: true,
    };
    addMessage(chatSessionId, userMessage);
    setInput("");
    setIsLoading(true);

    sendMessage.mutate({
      message: input,
      challengeId: isPlayground ? undefined : challengeId,
      stageIndex: isPlayground ? undefined : stageIndex,
      history: messages.filter((msg) => msg.isSystemDesignRelated),
      solution: extractSolutionData(),
      isPlayground,
      playgroundId,
      playgroundTitle,
    });
  }

  const renderMessage = useCallback(
    (message: Message) => {
      const isUser = message.role === "user";
      const isSystem = message.role === "system";

      return (
        <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[80%] rounded-lg px-4 py-2",
              isUser
                ? "bg-primary text-primary-foreground"
                : isSystem
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-muted",
            )}
          >
            {isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <>
                <ReactMarkdown
                  className={cn(
                    "prose prose-sm max-w-none dark:prose-invert",
                    isSystem ? "prose-invert" : "prose-neutral",
                    "break-words [&_p:last-child]:mb-0",
                    "[&_pre]:rounded [&_pre]:bg-secondary/50 [&_pre]:p-2",
                    "[&_code]:rounded [&_code]:bg-secondary/50 [&_code]:px-1 [&_code]:py-0.5",
                    "[&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2",
                    "[&_blockquote]:border-l-4 [&_blockquote]:border-primary/20 [&_blockquote]:pl-4 [&_blockquote]:italic",
                  )}
                >
                  {message.content}
                </ReactMarkdown>

                {/* Add retry button for system error messages */}
                {isSystem && !isLoading && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetry()}
                      className="text-xs"
                    >
                      Retry
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );
    },
    [isLoading],
  );

  // Add the retry handler function
  const handleRetry = useCallback(() => {
    // Get the last user message
    const userMessages = messages.filter((msg) => msg.role === "user");
    if (userMessages.length === 0 || isLoading) {
      return;
    }

    const lastUserMessage = userMessages[userMessages.length - 1];
    // Additional safety check
    if (!lastUserMessage?.content) {
      return;
    }

    // Remove the error message from the chat
    const messagesWithoutLastError = [...messages];
    // If the last message is a system message, remove it
    const lastMessage =
      messagesWithoutLastError.length > 0
        ? messagesWithoutLastError[messagesWithoutLastError.length - 1]
        : undefined;

    if (lastMessage && lastMessage.role === "system") {
      messagesWithoutLastError.pop();
    }

    // Update session messages
    clearSession(chatSessionId);
    messagesWithoutLastError.forEach((msg) => addMessage(chatSessionId, msg));

    // Set loading state
    setIsLoading(true);

    // Retry the API call with the last user message
    sendMessage.mutate({
      message: lastUserMessage.content,
      challengeId: isPlayground ? undefined : challengeId,
      stageIndex: isPlayground ? undefined : stageIndex,
      history: messagesWithoutLastError.filter(
        (msg) => msg.isSystemDesignRelated,
      ),
      solution: extractSolutionData(),
      isPlayground,
      playgroundId,
      playgroundTitle,
    });
  }, [
    messages,
    isLoading,
    clearSession,
    chatSessionId,
    addMessage,
    sendMessage,
    challengeId,
    stageIndex,
    extractSolutionData,
    isPlayground,
    playgroundId,
    playgroundTitle,
  ]);

  const MessageList = useMemo(() => {
    return (
      <div className="space-y-4 p-4">
        {messages.length === 0 && (
          <div className="p-4 text-center text-muted-foreground">
            Hi! I am your AI assistant. How can I help you with this challenge?
          </div>
        )}
        {messages.map((message, i) => (
          <div key={i}>{renderMessage(message)}</div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="min-h-[40px] max-w-[80%] rounded-lg bg-muted px-4 py-2">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    );
  }, [messages, isLoading, renderMessage]);

  return (
    <div className="flex h-full flex-col bg-secondary/30">
      {/* Credit warning banner when user has no credits left AND no free prompts remaining */}
      <CreditAlert
        variant="banner"
        className="mx-4 mt-3"
        hasNoFreePrompts={remainingMessages === 0}
      />

      {/* Chat messages area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        {MessageList}
      </ScrollArea>
      <div className="border-t border-border/40 bg-background/95">
        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
          {/* <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" />
            {rateLimitInfo ? (
              <>
                <span>{remainingMessages}/3 free</span>
                {remainingMessages === 0 && <span>(resets in 1h)</span>}
              </>
            ) : (
              <span>Loading free prompts...</span>
            )}
          </div> */}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2 p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              !rateLimitInfo
                ? "Loading available prompts..."
                : hasAvailablePrompts
                  ? "Type your message..."
                  : "No prompts remaining. Please wait for reset or purchase credits."
            }
            disabled={isLoading || !hasAvailablePrompts || !rateLimitInfo}
            className="flex-1 bg-muted/50"
          />
          <Button
            type="submit"
            size="icon"
            variant="secondary"
            disabled={isLoading || !hasAvailablePrompts || !rateLimitInfo}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
