// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import ts = require("typescript");
import {
  CancellationToken,
  ChatRequest,
  ChatResponseStream,
  LanguageModelChatMessage,
  LanguageModelChatSystemMessage,
  LanguageModelChatUserMessage,
} from "vscode";
import { compressCode, correctPropertyLoadSpelling, writeLogToFile } from "../Utils";
import { SampleProvider } from "../samples/sampleProvider";
import { getCodeGenerateGuidance } from "./codeGuidance";
import { ISkill } from "./iSkill"; // Add the missing import statement
import { Spec } from "./spec";
import { getCopilotResponseAsString } from "../../utils";
import { ExecutionResultEnum } from "./executionResultEnum";
import {
  MeasurementCodeGenAttemptCount,
  MeasurementCodeGenExecutionTimeInTotalSec,
  MeasurementScenarioBasedSampleMatchedCount,
  PropertySystemCodeGenIsCustomFunction,
  PropertySystemCodeGenResult,
  PropertySystemCodeGenTargetedOfficeHostApplication,
  MeasurementSystemCodegenTaskBreakdownAttemptFailedCount,
} from "../telemetryConsts";

const excelSystemPrompt = `
The following content written using Markdown syntax, using "Bold" style to highlight the key information.

Let's think step by step.
`;
const cfSystemPrompt = `
The following content written using Markdown syntax, using "Bold" style to highlight the key information.

There're some references help you to understand The Office JavaScript API Custom Functions, read it and repeat by yourself, Make sure you understand before process the user's prompt. 
# References:
## Understanding the difference between a Custom Functions and the normal TypeScript/JavaScript function:
In the context of Office Excel Custom Functions, there are several differences compared to normal JavaScript/TypeScript functions:
## Metadata 
Custom Functions require metadata that specifies the function name, parameters, return value, etc. This metadata is used by Excel to properly use the function.

## Async Pattern
Custom Functions can be asynchronous, but they must follow a specific pattern. They should return a Promise object, and Excel will wait for the Promise to resolve to get the result.

## Streaming Pattern
For streaming Custom Functions, they must follow a specific pattern. They should take a handler parameter (typically the last parameter), and call the handler.setResult method to update the cell value.

## Error Handling
To return an error from a Custom Function, you should throw an OfficeExtension.Error object with a specific error code.

## Limited API Access
Custom Functions can only call a subset of the Office JavaScript API that is specifically designed for Custom Functions.

## Stateless
Custom Functions are stateless, meaning they don't retain information between function calls. Each call to a function has separate memory and computation.

## Cancellation
Custom Functions should handle cancellation requests from Excel. When Excel cancels a function call, it rejects the Promise with an "OfficeExtension.Error" object that has the error code "OfficeExtension.ErrorCodes.generalException".

## Example of a Custom Function:
\`\`\`typescript
/**
 * Returns the second highest value in a matrixed range of values.
 * @customfunction
 * @param {number[][]} values Multiple ranges of values.
 */
function secondHighest(values) {
  let highest = values[0][0],
    secondHighest = values[0][0];
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values[i].length; j++) {
      if (values[i][j] >= highest) {
        secondHighest = highest;
        highest = values[i][j];
      } else if (values[i][j] >= secondHighest) {
        secondHighest = values[i][j];
      }
    }
  }
  return secondHighest;
}
\`\`\`
The @customfunction tag in the JSDoc comment is used to indicate that this is a Custom Function. The @param and @returns tags are used to specify the parameters and return value. It's important to follow this pattern when creating Custom Functions in Excel.

## Invocation parameter
Every custom function is automatically passed an invocation argument as the last input parameter, even if it's not explicitly declared. This invocation parameter corresponds to the Invocation object. The Invocation object can be used to retrieve additional context, such as the address of the cell that invoked your custom function. To access the Invocation object, you must declare invocation as the last parameter in your custom function.
The following sample shows how to use the invocation parameter to return the address of the cell that invoked your custom function. This sample uses the address property of the Invocation object. To access the Invocation object, first declare CustomFunctions.Invocation as a parameter in your JSDoc. Next, declare @requiresAddress in your JSDoc to access the address property of the Invocation object. Finally, within the function, retrieve and then return the address property.
\`\`\`typescript
/**
 * Return the address of the cell that invoked the custom function. 
 * @customfunction
 * @param {number} first First parameter.
 * @param {number} second Second parameter.
 * @param {CustomFunctions.Invocation} invocation Invocation object. 
 * @requiresAddress 
 */
function getAddress(first, second, invocation) {
  const address = invocation.address;
  return address;
}
\`\`\`

So once you understand the concept of Custom Functions, you should make sure:
- The JSDoc comment is correctly added to the function.
- The function must return a value.
- The invocation parameter is correctly added to the function.
- The function follows the asynchronous pattern if necessary.
- The function follows the streaming pattern if necessary.
- Although that is not forbidden, but you should explicitly state in your code that the function must avoid using the Office JavaScript API.

Let's think step by step.
`;

export class CodeGenerator implements ISkill {
  name: string;
  capability: string;

  constructor() {
    this.name = "Code Generator";
    this.capability = "Generate code";
  }

  public canInvoke(request: ChatRequest, spec: Spec): boolean {
    return !!request.prompt && request.prompt.length > 0 && !!spec;
  }

  public async invoke(
    languageModel: LanguageModelChatUserMessage,
    request: ChatRequest,
    response: ChatResponseStream,
    token: CancellationToken,
    spec: Spec
  ): Promise<{ result: ExecutionResultEnum; spec: Spec }> {
    const t0 = performance.now();
    if (
      !!spec.appendix.host ||
      !!spec.appendix.codeTaskBreakdown ||
      (spec.appendix.codeTaskBreakdown as string[]).length == 0
    ) {
      response.progress("Identify code-generation scenarios...");
      const breakdownResult = await this.userInputBreakdownTaskAsync(request, token);

      if (!breakdownResult) {
        if (
          !spec.appendix.telemetryData.measurements[
            MeasurementSystemCodegenTaskBreakdownAttemptFailedCount
          ]
        ) {
          spec.appendix.telemetryData.measurements[
            MeasurementSystemCodegenTaskBreakdownAttemptFailedCount
          ] = 0;
        }
        spec.appendix.telemetryData.measurements[
          MeasurementSystemCodegenTaskBreakdownAttemptFailedCount
        ] += 1;
        return { result: ExecutionResultEnum.Failure, spec: spec };
      }
      if (!breakdownResult.shouldContinue) {
        // Reject will make the whole request rejected
        spec.sections = breakdownResult.data;
        return { result: ExecutionResultEnum.Rejected, spec: spec };
      }

      spec.appendix.host = breakdownResult.host;
      spec.appendix.codeTaskBreakdown = breakdownResult.data;
      spec.appendix.isCustomFunction = breakdownResult.customFunctions;
      spec.appendix.complexity = breakdownResult.complexity;
    }

    if (!spec.appendix.telemetryData.measurements[MeasurementCodeGenAttemptCount]) {
      spec.appendix.telemetryData.measurements[MeasurementCodeGenAttemptCount] = 0;
    }
    spec.appendix.telemetryData.measurements[MeasurementCodeGenAttemptCount] += 1;
    let progressMessageStr = "generating code...";
    if (spec.appendix.complexity >= 50) {
      progressMessageStr =
        "This is a task with high complexity, may take a little bit longer..." + progressMessageStr;
    } else {
      progressMessageStr =
        "We should be able to generate the code in a short while..." + progressMessageStr;
    }
    response.progress(progressMessageStr);
    let codeSnippet: string | null = "";
    codeSnippet = await this.generateCode(
      request,
      token,
      spec.appendix.host,
      spec.appendix.isCustomFunction,
      spec.appendix.codeTaskBreakdown,
      spec
    );
    const t1 = performance.now();
    const duration = (t1 - t0) / 1000;
    if (!spec.appendix.telemetryData.measurements[MeasurementCodeGenExecutionTimeInTotalSec]) {
      spec.appendix.telemetryData.measurements[MeasurementCodeGenExecutionTimeInTotalSec] =
        duration;
    } else {
      spec.appendix.telemetryData.measurements[MeasurementCodeGenExecutionTimeInTotalSec] +=
        duration;
    }
    console.log(`Code generation took ${duration} seconds.`);
    if (!codeSnippet) {
      spec.appendix.telemetryData.properties[PropertySystemCodeGenResult] = "false";
      return { result: ExecutionResultEnum.Failure, spec: spec };
    }

    spec.appendix.telemetryData.properties[PropertySystemCodeGenResult] = "true";
    spec.appendix.codeSnippet = codeSnippet;
    return { result: ExecutionResultEnum.Success, spec: spec };
  }

  async userInputBreakdownTaskAsync(
    request: ChatRequest,
    token: CancellationToken
  ): Promise<null | {
    host: string;
    shouldContinue: boolean;
    customFunctions: boolean;
    data: string[];
    complexity: number;
  }> {
    const userPrompt = `
  Assume this is a ask: "${request.prompt}". I need you help to analyze it, and give me your suggestion. Follow the guidance below:
  - If the ask is not relevant to Microsoft Excel, Microsoft Word, or Microsoft PowerPoint, you should reject it because today this agent only support offer assistant to those Office host applications. And give the reason to reject the ask.
  - If the ask is not about automating a certain process or accomplishing a certain task using Office JavaScript Add-ins, you should reject it. And give the reason to reject the ask.
  - If the ask is **NOT JUST** asking for generate **TypeScript** or **JavaScript** code for Office Add-ins. You should reject it. And give the reason to reject the ask. For example, if part of the ask is about generating code of VBA, Python, HTML, CSS, or other languages, you should reject it. If that is not relevant to Office Add-ins, you should reject it. etc.
  - Otherwise, please think about if you can process the ask. 
    - If you cannot process the ask, you should reject it. And give me the reason to reject the ask.
    - If you can process the ask, you should:
      - Break it down into several steps, for each step that can be automated through code, design a TypeScript function. 
        - bypass the "generate other functions or generate add-ins" step.
        - List the function name as an item of markdown list. Then, explain the function in details. 
          - Including suggestions on the name of function, the parameters, the return value, and the TypeScript type of them. 
          - Then the detailed logic of the function, what operations it will be perform, and what Office JavaScript Add-ins API should be used inside of, etc. Describe all the details of logic as detailed as possible.
      - If user's ask is **NOT** about Office JavaScript Add-ins with custom functions, then descript a entry function in plain text, includes all any functions should be called in what order, and what the entry function should return. The entry function **must** named as "main", and takes no parameters, declared as 'async function'.
      
  **Return the result in the JSON object describe in the format of output section below**.

  Think about that step by step.
  `;
    const defaultSystemPrompt = `
  The following content written using Markdown syntax, using "Bold" style to highlight the key information.

  #Role:
  You are an expert in Office JavaScript Add-ins, and you are familiar with scenario and the capabilities of Office JavaScript Add-ins. You need to offer the user a suggestion based on the user's ask.

  #Your tasks:
  Repeat the user's ask, and then give your suggestion based on the user's ask. Follow the guidance below:
  If you suggested to accept the ask. Put the list of sub tasks into the "data" field of the output JSON object. A "shouldContinue" field on that JSON object should be true.
  If you suggested to reject the ask, put the reason to reject into the "data" field of the output JSON object. A "shouldContinue" field on that JSON object should be false.
  You must strickly follow the format of output.

  #The format of output:
  The output should be just a **JSON object**. You should not add anything else to the output
  - The first key named "host", that value is a string to indicate which Office application is the most relevant to the user's ask. You can pick from "Excel", "Word", "PowerPoint". 
  - The second key is "shouldContinue", the value is a Boolean.
  - The third key named "data", the value of it is the list of sub tasks or rejection reason, and that is a string array.
  - The fourth key named "complexity", the value of it is a number to indicate the complexity of the user's ask. The number should be between 1 to 100, 1 means the ask is very simple, 100 means the ask is very complex. This is the rule to calculate the complexity:
    - If there's no interaction with Office JavaScript Add-ins API, set the score range from very simple to simple. If maps to score, that coulld be (1, 25).
    - If there's a few interaction (less than 2) with Office JavaScript Add-ins API, set the score range from simple to medium. If maps to score, that coulld be (26, 50).
    - If there's several interaction (more than 2, less than 5) with Office JavaScript Add-ins API, set the score range from medium to complex. If maps to score, that coulld be (51, 75).
    - If there's many interaction (more than 5) with Office JavaScript Add-ins API, set the score range from complex to very complex. If maps to score, that coulld be (76, 100).
  - The last key named "customFunctions", set value of it to be a Boolean true if the user's ask is about Office JavaScript Add-ins with custom functions on Excel. Otherwise, set it to be a Boolean false.
  If the value of "shouldContinue" is true, then the value of "data" should be the list of sub tasks; if the value of "shouldContinue" is false, then the value of "data" should be the list of missing information or reason to reject. **Beyond this JSON object, you should not add anything else to the output**.

  Think about that step by step.
  `;

    // Perform the desired operation
    const messages: LanguageModelChatMessage[] = [
      new LanguageModelChatSystemMessage(defaultSystemPrompt),
      new LanguageModelChatUserMessage(userPrompt),
    ];
    const copilotResponse = await getCopilotResponseAsString(
      "copilot-gpt-3.5-turbo", // "copilot-gpt-3.5-turbo", // "copilot-gpt-4",
      messages,
      token
    );
    let copilotRet = {
      host: "",
      shouldContinue: false,
      customFunctions: false,
      complexity: 0,
      data: [],
    };

    try {
      const codeSnippetRet = copilotResponse.match(/```json([\s\S]*?)```/);
      if (!codeSnippetRet) {
        // try if the LLM already give a json object
        copilotRet = JSON.parse(copilotResponse.trim());
      } else {
        copilotRet = JSON.parse(codeSnippetRet[1].trim());
      }
      console.log(`The complexity score: ${copilotRet.complexity}`);
    } catch (error) {
      console.error("[User task breakdown] Failed to parse the response from Copilot:", error);
      return null;
    }

    return copilotRet;
  }

  async generateCode(
    request: ChatRequest,
    token: CancellationToken,
    host: string,
    isCustomFunctions: boolean,
    suggestedFunction: string[],
    spec: Spec
  ) {
    const userPrompt = `
The following content written using Markdown syntax, using "Bold" style to highlight the key information.

# Your role:
You're a professional and senior Office JavaScript Add-ins developer with a lot of experience and know all best practice on JavaScript, CSS, HTML, popular algorithm, and Office Add-ins API. You should help the user to automate a certain process or accomplish a certain task using Office JavaScript Add-ins.

# Context:
This is the ask need your help to generate the code for this request: ${request.prompt}.
- The request is about Office Add-ins, and it is relevant to the Office application "${host}".
- It's a suggested list of functions with their purpose and perhaps details. **Read through those descriptions, and repeat by yourself**. Make sure you understand that before go to the task:
${suggestedFunction.map((task) => `- ${task}`).join("\n")}

# Your tasks:
Generate code according to the user's ask, the generated code **MUST** include implementations of those functions listed above, and not limited to this. Code write in **TypeScript code** and **Office JavaScript Add-ins API**, while **follow the coding rule**. Do not generate code to invoke the "main" function or "entry" function if that function generated.

${getCodeGenerateGuidance(host)}

# Format of output:
**You must strickly follow the format of output**. The output will only contains code without any explanation on the code or generate process. Beyond that, nothing else should be included in the output.
- The code surrounded by a pair of triple backticks, and must follow with a string "typescript". For example:
\`\`\`typescript
// The code snippet
\`\`\`

Let's think step by step.
    `;
    spec.appendix.telemetryData.properties[PropertySystemCodeGenTargetedOfficeHostApplication] =
      host;
    spec.appendix.telemetryData.properties[PropertySystemCodeGenIsCustomFunction] =
      isCustomFunctions.toString();
    let defaultSystemPrompt = `
    The following content written using Markdown syntax, using "Bold" style to highlight the key information.

    # There're some samples relevant to the your's ask, you can read it and repeat by yourself, before start to generate code.
    `;
    let referenceUserPrompt = "";
    switch (host) {
      case "Excel":
        if (!isCustomFunctions) {
          referenceUserPrompt = excelSystemPrompt;
        } else {
          referenceUserPrompt = cfSystemPrompt;
        }
        break;
      default:
        defaultSystemPrompt = "";
        break;
    }

    // Then let's query if any code examples relevant to the user's ask that we can put as examples
    const scenarioSamples =
      await SampleProvider.getInstance().getTopKMostRelevantScenarioSampleCodes(
        request,
        token,
        host,
        request.prompt,
        2 // Get top 2 most relevant samples for now
      );
    if (scenarioSamples.size > 0) {
      const codeSnippets: string[] = [];
      scenarioSamples.forEach((sample, api) => {
        codeSnippets.push(`- ${sample.description}:
                              \`\`\`typescript
                              ${sample.codeSample}
                              \`\`\`\n`);
      });

      if (codeSnippets.length > 0) {
        defaultSystemPrompt = defaultSystemPrompt.concat(`\n${codeSnippets.join("\n")}\n\n`);
      }
    }
    if (!spec.appendix.telemetryData.measurements[MeasurementScenarioBasedSampleMatchedCount]) {
      spec.appendix.telemetryData.measurements[MeasurementScenarioBasedSampleMatchedCount] = 0;
    }
    spec.appendix.telemetryData.measurements[MeasurementScenarioBasedSampleMatchedCount] +=
      scenarioSamples.size > 0 ? 1 : 0;

    // Perform the desired operation
    const messages: LanguageModelChatMessage[] = [
      new LanguageModelChatSystemMessage(referenceUserPrompt),
      new LanguageModelChatSystemMessage(defaultSystemPrompt),
      new LanguageModelChatUserMessage(userPrompt),
    ];
    const copilotResponse = await getCopilotResponseAsString(
      spec.appendix.complexity >= 50 ? "copilot-gpt-4" : "copilot-gpt-3.5-turbo",
      messages,
      token
    );

    // extract the code snippet and the api list out
    const codeSnippetRet = copilotResponse.match(/```typescript([\s\S]*?)```/);
    if (!codeSnippetRet) {
      // something wrong with the LLM output
      // TODO: Add handling for this case
      console.error(
        "[Code generation] Failed to extract the code snippet from the response:",
        copilotResponse
      );
      return null;
    }

    return correctPropertyLoadSpelling(codeSnippetRet[1].trim());
  }
}
