import { type Node } from "reactflow";
import {
  type WhiteboardNodeDataProps,
  type SystemComponentNodeDataProps,
} from "../ReactflowCustomNodes/SystemComponentNode";
import { CacheSettings } from "../SystemComponents/Cache";
import { CDNSettings } from "../SystemComponents/CDN";
import { ClientSettings } from "../SystemComponents/Client";
import { DatabaseSettings } from "../SystemComponents/Database";
import { LoadBalancerSettings } from "../SystemComponents/LoadBalancer";
import { MessageQueueSettings } from "../SystemComponents/MessageQueue";
import { ServerSettings } from "../SystemComponents/Server";
import { CustomComponentSettings } from "../SystemComponents/CustomComponent";

export const ComponentSettings = ({
  node,
  className,
  canEdit = true,
}: {
  node: Node<SystemComponentNodeDataProps | WhiteboardNodeDataProps> | null;
  className?: string;
  canEdit?: boolean;
}) => {
  const id = node?.id ?? "";

  if (!node) return null;

  if (node.type !== "SystemComponentNode") return null;

  return (
    <div className={className}>
      {!canEdit && (
        <div className="p-2 text-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          Component settings are read-only
        </div>
      )}
      <div className="component-settings-container overflow-auto">
        <div className="component-inner-content w-full">
          {/* Import and create the settings components directly */}
          {node.id.includes("Client") && <ClientSettings name={id} />}
          {node.id.includes("Server") && <ServerSettings name={id} />}
          {node.id.includes("Database") && <DatabaseSettings name={id} />}
          {node.id.includes("Cache") && <CacheSettings name={id} />}
          {node.id.includes("CDN") && <CDNSettings name={id} />}
          {node.id.includes("Load Balancer") && (
            <LoadBalancerSettings name={id} />
          )}
          {node.id.includes("Message Queue") && (
            <MessageQueueSettings name={id} />
          )}
          {node.id.includes("Custom Component") && (
            <CustomComponentSettings name={id} />
          )}
        </div>
      </div>
    </div>
  );
};
