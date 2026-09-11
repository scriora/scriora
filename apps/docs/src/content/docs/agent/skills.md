---
title: "Skills Registry & Custom Skills"
---

The Scriora Agent utilizes a pluggable **Skills Registry** (`@scriora/agent/src/skills/registry`). Skills are modular units of capability that the agent can discover and invoke during its autonomous loop.

---

## 🧩 The `SkillContract` Interface

Every skill implements a strict TypeScript contract:

```typescript
import { z } from "zod";

export interface SkillContract<TInput, TOutput> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: "ai" | "deterministic" | "analytics" | "social";
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  
  execute(input: TInput, context: SkillExecutionContext): Promise<TOutput>;
}
```

---

## 📦 Built-in Skills

1. **`copywriter`**: Generates platform-tailored social copy based on workspace brand voice.
2. **`hashtag_optimizer`**: Recommends high-performing, non-spam tags per platform.
3. **`schedule_optimizer`**: Analyzes historical audience engagement to calculate the highest conversion window.
4. **`media_resizer`**: Automatically invokes `@scriora/media` to produce required aspect ratios (1:1 for Instagram, 16:9 for X, 9:16 for TikTok/Reels).
5. **`sentiment_analyzer`**: Analyzes incoming comments and social mentions.

---

## 🛠️ Registering a Custom Skill

To register a custom business skill:

```typescript
import { skillRegistry } from "@scriora/agent";
import { z } from "zod";

const myCustomSkill = {
  id: "company.quote_generator",
  name: "Daily Quote Generator",
  description: "Fetches approved internal quotes for morning social posts",
  category: "deterministic",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ quote: z.string(), author: z.string() }),
  async execute({ topic }) {
    // Custom domain logic
    return { quote: "Move fast with confidence", author: "Internal" };
  }
};

skillRegistry.register(myCustomSkill);
```
