import { Annotation, Command, END, interrupt, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Company, SummaryState } from 'interfaces/state.interface';
import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';


const RiskSchema = z.object({
  riskScore: z.number().min(1).max(5).describe("The general risk profile score from 1 to 5"),
});


const StateAnnotation = Annotation.Root({
  companies: Annotation<Company[]>(),
  draft: Annotation<string | undefined>(),
});


@Injectable()
export class GraphService {
  private readonly appGraph;

  constructor(private configService: ConfigService) {

    const llm = new ChatOpenAI({
      model: 'gpt-4o-mini',
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });

    const scoreCompanies = async (state: typeof StateAnnotation.State) => {
      // Map your companies into an array of promises to run them in parallel
      const updatedCompanies = await Promise.all(
        state.companies.map(async (company) => {
          if (!company.risk) {
            // 2. Bind the schema to the LLM so it ONLY returns the JSON structure
            const structuredLlm = llm.withStructuredOutput(RiskSchema);

            const response = await structuredLlm.invoke([
              {
                role: "system",
                content: "You are a risk assessment AI. Analyze the company and provide a risk score from 1 to 5. (where 1 is low risk)"
              },
              { role: "user", content: JSON.stringify(company) },
            ]);

            // response is now typed as { riskScore: number }
            return {
              ...company,
              risk: response.riskScore,
            };
          }

          return company

        })
      );

      // 3. Return the updated array to the LangGraph state
      const outputPath = path.join(process.cwd(), 'data', 'companiesWithRisk.json');
      fs.writeFileSync(outputPath, JSON.stringify(updatedCompanies, null, 2), 'utf8');

      return { companies: updatedCompanies };
    };

    const humanReview = async (state: typeof StateAnnotation.State) => {
      const approvedCompanies: Company[] = [];

      for (const company of state.companies) {
        // Pause execution and send the company to the user for review.
        // The return value is whatever the user sends back via Command({ resume: ... }).
        const decision = interrupt({
          company,
          message: `Please approve or reject: ${company.name} (${company.ticker})`,
        });

        if (decision?.approve) {
          // If the user provided a risk override, apply it
          const finalCompany = (decision.risk != null)
            ? { ...company, risk: decision.risk }
            : company;
          approvedCompanies.push(finalCompany);
        }
        // If not approved, the company is simply not added (i.e. removed from state).
      }

      console.log('approvedCompanies', approvedCompanies);

      return { companies: approvedCompanies };
    };

    const workflow = new StateGraph(StateAnnotation)
      .addNode("scoreCompanies", scoreCompanies)
      .addNode("humanReview", humanReview)
      .addEdge(START, "scoreCompanies")
      .addEdge("scoreCompanies", "humanReview")
      .addEdge("humanReview", END);

    // https://docs.langchain.com/oss/javascript/langgraph/persistence
    const memory = new MemorySaver();
    this.appGraph = workflow.compile({ checkpointer: memory });
  }

  private readonly threadConfig = { configurable: { thread_id: "1" } };

  async start() {
    console.log('working.');

    // Read the input companies from the JSON file
    const inputPath = path.join(process.cwd(), 'data', 'inputCompanies.json');
    const inputData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    const initialState: SummaryState = {
      companies: inputData
    };

    // Invoke the graph — it will pause at the first interrupt in humanReview
    const result = await this.appGraph.invoke(initialState, this.threadConfig);

    console.log('Graph paused or completed.');
    return result;
  }

  /**
   * Get the current graph state including any pending interrupts.
   */
  async getState() {
    const state = await this.appGraph.getState(this.threadConfig);
    return state;
  }

  /**
   * Resume the graph after an interrupt with the user's decision.
   * @param approve - whether the user approves the current company
   */
  async resume(approve: boolean, risk?: number) {
    const resumePayload: { approve: boolean; risk?: number } = { approve };
    if (risk != null) {
      resumePayload.risk = risk;
    }
    const result = await this.appGraph.invoke(
      new Command({ resume: resumePayload }),
      this.threadConfig,
    );
    return result;
  }
}
