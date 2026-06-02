import { Controller, Get, Post, Render } from '@nestjs/common';
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
  start() {
    this.graphService.start();
    return { status: 'started' };
  }
}
