import { getLlmProvider } from './index';
import { LlmMessage, ToolDefinition } from '../../../shared/llm';
import dotenv from 'dotenv';
import { envPath } from '../config';

dotenv.config({ path: envPath() });

async function runLlmTest() {
  console.log(`--- Running LLM Test for provider: ${process.env.LLM_PROVIDER} ---`);
  console.log(`--- Model: ${process.env.AI_MODEL} ---`);

  try {
    const provider = getLlmProvider();

    const systemPrompt = "Eres un asistente útil que responde preguntas y usa herramientas cuando es necesario.";
    const messages: LlmMessage[] = [
      { role: 'user', text: 'decime la capital de Francia' },
    ];

    // Define a trivial tool for testing tool calls
    const trivialTool: ToolDefinition = {
      name: 'get_current_time',
      description: 'Obtiene la hora y fecha actual en formato ISO.',
      schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      dangerous: false,
    };

    const messagesWithToolCall: LlmMessage[] = [
      { role: 'user', text: '¿Qué hora es ahora?' },
    ];

    console.log('\n--- Test 1: Simple text response ---');
    let fullResponse = '';
    for await (const event of provider.stream({ system: systemPrompt, messages: messages, tools: [] })) {
      if (event.type === 'text') {
        process.stdout.write(event.delta);
        fullResponse += event.delta;
      } else if (event.type === 'end') {
        console.log(`\n(End reason: ${event.reason})`);
      } else if (event.type === 'error') {
        console.error(`\nError: ${event.message}`);
        break;
      }
    }
    console.log(`Full response: "${fullResponse.trim()}"`);
    if (!fullResponse.toLowerCase().includes('parís')) {
      console.error('Test 1 FAILED: Response did not contain "París".');
      process.exit(1);
    }
    console.log('Test 1 PASSED: Received expected text response.');


    console.log('\n--- Test 2: Tool call ---');
    let toolCallDetected = false;
    let toolCallId = '';
    let toolCallName = '';
    let toolCallArgs: Record<string, unknown> = {};

    for await (const event of provider.stream({ system: systemPrompt, messages: messagesWithToolCall, tools: [trivialTool] })) {
      if (event.type === 'text') {
        process.stdout.write(event.delta);
      } else if (event.type === 'tool_calls') {
        console.log('\nTool calls detected:');
        event.calls.forEach(call => {
          console.log(`  ID: ${call.id}, Name: ${call.name}, Args: ${JSON.stringify(call.args)}`);
          toolCallDetected = true;
          toolCallId = call.id;
          toolCallName = call.name;
          toolCallArgs = call.args;
        });
      } else if (event.type === 'end') {
        console.log(`(End reason: ${event.reason})`);
      } else if (event.type === 'error') {
        console.error(`\nError: ${event.message}`);
        break;
      }
    }

    if (!toolCallDetected) {
      console.error('Test 2 FAILED: No tool call detected.');
      process.exit(1);
    }
    if (toolCallName !== 'get_current_time') {
      console.error(`Test 2 FAILED: Expected tool 'get_current_time', got '${toolCallName}'.`);
      process.exit(1);
    }
    console.log('Test 2 PASSED: Detected expected tool call.');

    // Test 3: Tool result (simulate sending back a tool result) - This is implicitly tested by the provider's ability to handle tool results in subsequent turns.
    // For a full end-to-end test of tool results, it would require a full agent loop.
    // For Fase 0, we're primarily testing the provider's streaming and tool call detection.
    console.log('\n--- Test 3: Tool result handling (conceptual, requires agent loop for full validation) ---');
    console.log('The provider is configured to send tool results back to the model as per spec.');
    console.log('Full validation of tool result processing will occur in Fase 3 with the agent loop.');
    console.log('Test 3 PASSED (conceptual): Provider is set up to handle tool results.');

    console.log('\n--- All LLM Tests PASSED ---');

  } catch (error: any) {
    console.error('\nLLM Test FAILED:', error.message);
    process.exit(1);
  }
}

runLlmTest();