import { z } from 'zod';
import { ToolDefinition } from '../../../shared/llm';
import { zodToJsonSchema, safeParseArgs } from './schema';
import { getCurrentTime } from './getCurrentTime';
import { calculator } from './calculator';
import { listDirectory } from './listDirectory';
import { readFile } from './readFile';
import { writeFile } from './writeFile';
import { searchInFiles } from './searchInFiles';
import { executeCommand } from './executeCommand';
import { webSearch } from './webSearch';
import { browser } from './browser';
import { whatsapp } from './whatsapp';
import { n8nListWorkflows } from './n8nListWorkflows';
import { n8nRunWorkflow } from './n8nRunWorkflow';
import { n8nExecutionStatus } from './n8nExecutionStatus';
import { remember } from './remember';
import { recall } from './recall';
import { forget } from './forget';
import { listProjects } from './listProjects';
import { upsertProject } from './upsertProject';
import { createTask } from './createTask';
import { listTasks } from './listTasks';
import { completeTask } from './completeTask';
import { createNote } from './createNote';
import { searchNotes } from './searchNotes';
import { dailyBrief } from './dailyBrief';
import { gitStatus } from './gitStatus';
import { openInEditor } from './openInEditor';
import { runProject } from './runProject';

export interface Tool<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: T;
  dangerous: boolean;
  dangerReason(args: Record<string, unknown>): string | null;
  handler(data: z.infer<T>): Promise<string> | string;
}

const TOOLS: Tool[] = [
  getCurrentTime,
  calculator,
  listDirectory,
  readFile,
  writeFile,
  searchInFiles,
  executeCommand,
  webSearch,
  browser,
  whatsapp,
  n8nListWorkflows,
  n8nRunWorkflow,
  n8nExecutionStatus,
  remember,
  recall,
  forget,
  listProjects,
  upsertProject,
  createTask,
  listTasks,
  completeTask,
  createNote,
  searchNotes,
  dailyBrief,
  gitStatus,
  openInEditor,
  runProject,
];

export type ToolRegistry = {
  definitions(): ToolDefinition[];
  get(name: string): Tool | undefined;
  run(name: string, args: Record<string, unknown>): Promise<{ ok: true; content: string } | { ok: false; content: string }>;
  isDangerous(name: string, args: Record<string, unknown>): { dangerous: boolean; reason: string | null };
};

export function getToolRegistry(): ToolRegistry {
  return {
    definitions(): ToolDefinition[] {
      return TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        schema: zodToJsonSchema(t.schema),
        dangerous: t.dangerous,
      }));
    },

    get(name: string): Tool | undefined {
      return TOOLS.find((t) => t.name === name);
    },

    async run(name, args) {
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        return { ok: false, content: `Tool desconocida: ${name}` };
      }
      const parsed = safeParseArgs(tool.schema, args);
      if (!parsed.ok) {
        return { ok: false, content: `Argumentos inválidos para ${name}: ${parsed.error}` };
      }
      try {
        const content = await tool.handler(parsed.data);
        return { ok: true, content: typeof content === 'string' ? content : JSON.stringify(content) };
      } catch (err: any) {
        return { ok: false, content: err?.message || String(err) };
      }
    },

    isDangerous(name, args) {
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return { dangerous: false, reason: null };
      const reason = tool.dangerReason(args);
      if (reason) return { dangerous: true, reason };
      return { dangerous: false, reason: null };
    },
  };
}
