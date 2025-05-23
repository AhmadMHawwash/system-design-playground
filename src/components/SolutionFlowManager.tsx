import { useFeatureCustomisation, useFeatures } from "@/lib/hooks/useFeatures";
import { useSystemDesigner } from "@/lib/hooks/_useSystemDesigner";
import { componentsNumberingStore } from "@/lib/levels/utils";
import {
  type EvaluationResponse,
  type PlaygroundResponse,
} from "@/server/api/routers/checkAnswer";
import { Check, Loader2, Play, RotateCcw } from "lucide-react";
import React, { Suspense, useEffect, useState } from "react";
import { SolutionFeedback } from "./SolutionFeedback";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { defaultStartingNodes } from "@/lib/hooks/systemDesignerUtils";

export type Maybe<T> = T | undefined | null;
interface FlowManagerProps {
  checkSolution: () => void;
  feedback: Maybe<EvaluationResponse | PlaygroundResponse>;
  isLoadingAnswer: boolean;
  isFeedbackExpanded: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNextStage?: () => void;
}

export const FlowManager: React.FC<FlowManagerProps> = ({
  checkSolution,
  feedback,
  isLoadingAnswer,
  isFeedbackExpanded,
  onOpen,
  onClose,
  onNextStage,
}) => {
  const { runSolutionLabel } = useFeatureCustomisation();
  const { canRunSolution } = useFeatures();
  const [resetDone, setResetDone] = useState(false);
  const { setNodes, setEdges } = useSystemDesigner();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const resetFlow = () => {
    componentsNumberingStore.getState().resetCounting();
    setNodes(defaultStartingNodes);
    setEdges([]);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 1500);
  };

  if (!isClient) {
    return null; // or a loading placeholder
  }

  return (
    <div
      id="flow-manager"
      className={`flow-manager flex flex-col items-center rounded-lg border border-gray-300 bg-gray-100 p-2 sm:p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800 ${
        isFeedbackExpanded ? "w-full max-w-4xl" : "w-fit"
      } transition-all duration-300 fixed bottom-0 left-0 right-0 sm:static z-10`}
    >
      <div className="flex w-full flex-wrap justify-center gap-2 sm:flex-nowrap sm:items-center sm:space-x-3 sm:gap-0">
        <ResetFlowButton resetDone={resetDone} onReset={resetFlow} />
        <div className="relative">
          {!canRunSolution && (
            <Badge
              variant="default"
              className="absolute -right-4 -top-3 z-10 opacity-80"
            >
              Soon
            </Badge>
          )}
          <RunSolutionButton
            isLoading={isLoadingAnswer}
            onClick={checkSolution}
            disabled={!canRunSolution}
            label={runSolutionLabel}
          />
        </div>
        <Suspense
          fallback={<div className="h-8 w-full animate-pulse-gentle"></div>}
        >
          <SolutionFeedback
            isLoadingAnswer={isLoadingAnswer}
            answer={feedback}
            isOpen={isFeedbackExpanded}
            onClose={onClose}
            onOpen={onOpen}
            onNextStage={onNextStage}
          />
        </Suspense>
      </div>
    </div>
  );
};

const ResetFlowButton: React.FC<{
  resetDone: boolean;
  onReset: () => void;
}> = ({ resetDone, onReset }) => (
  <ShouldResetFlowModal
    trigger={
      <Button variant="outline" size="sm" className="reset-flow-button flex items-center gap-2 w-full sm:w-auto">
        {resetDone ? (
          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
        ) : (
          <RotateCcw className="h-4 w-4" />
        )}
        Reset
      </Button>
    }
    onReset={onReset}
  />
);

const RunSolutionButton: React.FC<{
  isLoading: boolean;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}> = ({ isLoading, onClick, disabled, label }) => (
  <Button
    size="sm"
    onClick={onClick}
    disabled={isLoading || disabled}
    className="check-solution-button bg-blue-600 text-white transition-colors hover:bg-blue-700 w-full sm:w-auto"
  >
    {isLoading ? (
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
    ) : (
      <Play className="mr-2 h-4 w-4" />
    )}
    {label}
  </Button>
);

interface ShouldResetFlowModalProps {
  trigger: React.ReactNode;
  onReset: () => void;
}

const ShouldResetFlowModal: React.FC<ShouldResetFlowModalProps> = ({
  trigger,
  onReset,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle>Are you sure you want to reset the flow?</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          This will reset the flow to the initial state.
        </DialogDescription>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
            variant="destructive"
          >
            Reset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
