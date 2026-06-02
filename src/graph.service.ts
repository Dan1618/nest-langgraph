import { MemorySaver, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SummaryState } from 'interfaces/state.interface';
import * as fs from 'fs';
import * as path from 'path';




@Injectable()
export class GraphService {
  private readonly appGraph;

  //### chce wyslac wiele razy do llma pytanie o kazdy z elementow osobno
  // czyli jakas petla, promiseAll, if(!company.risk)
  // # jak wywolac call i zrobic zapis a) w state b) w pliku
  constructor(private configService: ConfigService) {

    const llm = new ChatOpenAI({
      model: 'gpt-4o-mini',
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });

    const scoreCompanies = async (state: SummaryState) => {
      const response = await llm.invoke([
        { role: "system", content: "Summarize these companies concisely." },
        { role: "user", content: JSON.stringify(state.companies) },
      ]);
      return { draft: response.content.toString() };
    };

    const workflow = new StateGraph<SummaryState>()
      .addEdge('__start__', 'scoreCompanies')
      .addNode("scoreCompanies", scoreCompanies)
      .addEdge("scoreCompanies", "__end__")

    // https://docs.langchain.com/oss/javascript/langgraph/persistence
    const memory = new MemorySaver();
    this.appGraph = workflow.compile({ checkpointer: memory });
  }

  async start() {
    console.log('working.');

    // Read the input companies from the JSON file
    const inputPath = path.join(process.cwd(), 'data', 'inputCompanies.json');
    const inputData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    const initialState: SummaryState = {
      companies: inputData
    };

    // Invoke the graph with the initial state
    const result = await this.appGraph.invoke(initialState, {
      configurable: { thread_id: "1" }
    });

    console.log('Graph execution completed.');
    console.log('Summary Result:', result.draft);
  }
}
