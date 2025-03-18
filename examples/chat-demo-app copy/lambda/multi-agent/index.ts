import { Logger } from "@aws-lambda-powertools/logger";
import {
  MultiAgentOrchestrator,
  BedrockLLMAgent,
  DynamoDbChatStorage,
  LexBotAgent,
  AmazonKnowledgeBasesRetriever,
  LambdaAgent,
  BedrockClassifier,
} from "multi-agent-orchestrator";
import { weatherToolDescription, weatherToolHanlder } from './weather_tool'
import { mathToolHanlder, mathAgentToolDefinition } from './math_tool';
import { APIGatewayProxyEventV2, Handler, Context } from "aws-lambda";
import { Buffer } from "buffer";
import { GREETING_AGENT_PROMPT, MATH_AGENT_PROMPT, INCIDENT_REPORTING_AGENT_PROMPT, SELF_CHECKIN_AGENT_PROMPT, FACILITY_BOOKING_AGENT_PROMPT, VISITOR_MANAGEMENT_AGENT_PROMPT, SMART_IOT_CONTROL_AGENT_PROMPT, WEATHER_AGENT_PROMPT } from "./prompts";
import { BedrockAgentRuntimeClient, SearchType } from '@aws-sdk/client-bedrock-agent-runtime';


const logger = new Logger();


declare global {
  namespace awslambda {
    function streamifyResponse(
      f: (
        event: APIGatewayProxyEventV2,
        responseStream: NodeJS.WritableStream,
        context: Context
      ) => Promise<void>
    ): Handler;
  }
}

interface LexAgentConfig {
  name: string;
  description: string;
  botId: string;
  botAliasId: string;
  localeId: string;
}

interface BodyData {
  query: string;
  sessionId: string;
  userId: string;
}

const LEX_AGENT_ENABLED = process.env.LEX_AGENT_ENABLED || "false";

const storage = new DynamoDbChatStorage(
  process.env.HISTORY_TABLE_NAME!,
  process.env.AWS_REGION!,
  process.env.HISTORY_TABLE_TTL_KEY_NAME,
  Number(process.env.HISTORY_TABLE_TTL_DURATION),
);

const orchestrator = new MultiAgentOrchestrator({
  storage: storage,
  config: {
    LOG_AGENT_CHAT: true,
    LOG_CLASSIFIER_CHAT: true,
    LOG_CLASSIFIER_RAW_OUTPUT: true,
    LOG_CLASSIFIER_OUTPUT: true,
    LOG_EXECUTION_TIMES: true,
  },
  logger: logger,
  classifier: new BedrockClassifier({
    modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  }),
});

const weatherAgent = new BedrockLLMAgent({
  name: "Weather Agent",
  description: "Specialized agent for giving weather condition from a city.",
  streaming: true,
  inferenceConfig: {
    temperature: 0.0,
  },
  toolConfig: {
    useToolHandler: weatherToolHanlder,
    tool: weatherToolDescription,
    toolMaxRecursions: 5,
  },
});

weatherAgent.setSystemPrompt(WEATHER_AGENT_PROMPT);

// Add a our custom Math Agent to the orchestrator
const mathAgent = new BedrockLLMAgent({
  name: "Math Agent",
  description:
    "Specialized agent for solving mathematical problems. Can dynamically create and execute mathematical operations, handle complex calculations, and explain mathematical concepts. Capable of working with algebra, calculus, statistics, and other advanced mathematical fields.",
  streaming: false,
  inferenceConfig: {
    temperature: 0.0,
  },
  toolConfig: {
    useToolHandler: mathToolHanlder,
    tool: mathAgentToolDefinition,
    toolMaxRecursions: 5,
  },
});
mathAgent.setSystemPrompt(MATH_AGENT_PROMPT);

const selfCheckInAgent = new BedrockLLMAgent({
  name: "Self-Check-In Agent",
  description: "Assists with onboarding (WiFi details, building info, check-in instructions, etc.).",
  streaming: false,
});
selfCheckInAgent.setSystemPrompt(SELF_CHECKIN_AGENT_PROMPT);


const incidentReportingAgent = new BedrockLLMAgent({
  name: "Incident Reporting Agent",
  description: "Logs and tracks maintenance/security issues.",
  streaming: false,
});
incidentReportingAgent.setSystemPrompt(INCIDENT_REPORTING_AGENT_PROMPT);

const facilityBookingAgent = new BedrockLLMAgent({
  name: "Facility Booking Agent",
  description: "Manages reservations for shared spaces.",
  streaming: false,
});
facilityBookingAgent.setSystemPrompt(FACILITY_BOOKING_AGENT_PROMPT);

const visitorManagementAgent = new BedrockLLMAgent({
  name: "Visitor Management Agent",
  description: "Handles guest registration and access control.",
  streaming: false,
});
visitorManagementAgent.setSystemPrompt(VISITOR_MANAGEMENT_AGENT_PROMPT);

const smartIoTControlAgent = new BedrockLLMAgent({
  name: "Smart IoT Control Agent",
  description: "Manages smart devices and automates routines for convenience and energy savings.",
  streaming: false,
});
smartIoTControlAgent.setSystemPrompt(SMART_IOT_CONTROL_AGENT_PROMPT);

orchestrator.addAgent(incidentReportingAgent);
orchestrator.addAgent(selfCheckInAgent);
orchestrator.addAgent(facilityBookingAgent);
orchestrator.addAgent(visitorManagementAgent);
orchestrator.addAgent(smartIoTControlAgent);
orchestrator.addAgent(weatherAgent);

const greetingAgent = new BedrockLLMAgent({
  name: "Greeting Agent",
  description: "Welcome the user and list him the available agents",
  streaming: true,
  inferenceConfig: {
    temperature: 0.0,
  },
  saveChat: false,
});

const agents = orchestrator.getAllAgents();
const agentList = Object.entries(agents)
  .map(([agentKey, agentInfo], index) => {
    const name = (agentInfo as any).name || agentKey;
    const description = (agentInfo as any).description;
    return `${index + 1}. **${name}**: ${description}`;
  })
  .join('\n\n');
greetingAgent.setSystemPrompt(GREETING_AGENT_PROMPT(agentList));


orchestrator.addAgent(greetingAgent);

async function eventHandler(
  event: APIGatewayProxyEventV2,
  responseStream: NodeJS.WritableStream
) {
  logger.info(event);

  try {
    const userBody = JSON.parse(event.body as string) as BodyData;
    const userId = userBody.userId;
    const sessionId = userBody.sessionId;
    
    logger.info("calling the orchestrator");
    const response = await orchestrator.routeRequest(
      userBody.query,
      userId,
      sessionId
    );

    logger.info("response from the orchestrator");

    let safeBuffer = Buffer.from(
      JSON.stringify({
        type: "metadata",
        data: response,
      }) + "\n",
      "utf8"
    );

    responseStream.write(safeBuffer);

    if (response.streaming == true) {
      logger.info("\n** RESPONSE STREAMING ** \n");
      // Send metadata immediately
      logger.info(` > Agent ID: ${response.metadata.agentId}`);
      logger.info(` > Agent Name: ${response.metadata.agentName}`);

      logger.info(`> User Input: ${response.metadata.userInput}`);
      logger.info(`> User ID: ${response.metadata.userId}`);
      logger.info(`> Session ID: ${response.metadata.sessionId}`);
      logger.info(
        `> Additional Parameters:`,
        response.metadata.additionalParams
      );
      logger.info(`\n> Response: `);

      for await (const chunk of response.output) {
        if (typeof chunk === "string") {
          process.stdout.write(chunk);

          safeBuffer = Buffer.from(
            JSON.stringify({
              type: "chunk",
              data: chunk,
            }) + "\n"
          );

          responseStream.write(safeBuffer);
        } else {
          logger.error("Received unexpected chunk type:", typeof chunk);
        }
      }
    } else {
      // Handle non-streaming response (AgentProcessingResult)
      logger.info("\n** RESPONSE ** \n");
      logger.info(` > Agent ID: ${response.metadata.agentId}`);
      logger.info(` > Agent Name: ${response.metadata.agentName}`);
      logger.info(`> User Input: ${response.metadata.userInput}`);
      logger.info(`> User ID: ${response.metadata.userId}`);
      logger.info(`> Session ID: ${response.metadata.sessionId}`);
      logger.info(
        `> Additional Parameters:`,
        response.metadata.additionalParams
      );
      logger.info(`\n> Response: ${response.output}`);

      safeBuffer = Buffer.from(
        JSON.stringify({
          type: "complete",
          data: response.output,
        })
      );

      responseStream.write(safeBuffer);
    }
  } catch (error) {
    logger.error("Error: " + error);

    responseStream.write(
      JSON.stringify({
        response: error,
      })
    );
  } finally {
    responseStream.end();
  }
}

export const handler = awslambda.streamifyResponse(eventHandler);

