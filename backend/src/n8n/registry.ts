import fs from 'fs';
import path from 'path';
import { projectRoot } from '../config';

export interface RegistryWorkflow {
  name: string;
  n8n_workflow: string;
  webhook_path: string;
  description: string;
  category: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  input_schema?: Record<string, unknown>;
  active: boolean;
}

export interface RegistryFile {
  workflows: RegistryWorkflow[];
}

export function loadRegistry(): RegistryFile {
  const filePath = path.join(projectRoot(), 'n8n', 'registry.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as RegistryFile;
}

export function findWorkflow(name: string): RegistryWorkflow | undefined {
  return loadRegistry().workflows.find((w) => w.name === name);
}

export function listWorkflows(): RegistryWorkflow[] {
  return loadRegistry().workflows;
}
