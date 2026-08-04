import { aniTopic } from "./ani.js";
import { growthTopic } from "./growth.js";
import { techTopic } from "./tech.js";
import type { Topic } from "./types.js";

export const TOPICS: Record<string, Topic> = {
  ani: aniTopic,
  tech: techTopic,
  growth: growthTopic,
};

export const TOPIC_IDS = Object.keys(TOPICS);

export function getTopic(id: string): Topic {
  const topic = TOPICS[id];
  if (!topic) throw new Error(`알 수 없는 토픽: "${id}" (가능: ${TOPIC_IDS.join(", ")})`);
  return topic;
}
