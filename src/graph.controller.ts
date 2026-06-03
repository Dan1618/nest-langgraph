import { Body, Controller, Get, Post, Render } from '@nestjs/common';
import { GraphService } from './graph.service';

@Controller()
export class AppController {
  constructor(private readonly graphService: GraphService) { }

  @Get()
  @Render('index')
  root() {
    return { message: 'Hello world!' };
  }

  @Post('start')
  async start() {
    const result = await this.graphService.start();
    // After scoring, the graph pauses at humanReview — fetch the interrupt state
    const state = await this.graphService.getState();
    return {
      status: 'paused_for_review',
      interrupts: state.tasks?.map((t: any) => t.interrupts).flat() ?? [],
    };
  }

  @Get('state')
  async getState() {
    const state = await this.graphService.getState();
    return {
      next: state.next,
      interrupts: state.tasks?.map((t: any) => t.interrupts).flat() ?? [],
      values: state.values,
    };
  }

  @Post('review')
  async review(@Body() body: { approve: boolean; risk?: number }) {
    const risk = body.risk != null ? Number(body.risk) : undefined;
    const result = await this.graphService.resume(body.approve, risk);
    // Check if there are more interrupts (more companies to review)
    const state = await this.graphService.getState();
    const pendingInterrupts = state.tasks?.map((t: any) => t.interrupts).flat() ?? [];

    if (pendingInterrupts.length > 0) {
      return {
        status: 'paused_for_review',
        interrupts: pendingInterrupts,
      };
    }

    return {
      status: 'completed',
      companies: result.companies,
    };
  }
}
