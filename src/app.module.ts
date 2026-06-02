import { Module } from '@nestjs/common';
import { AppController } from './graph.controller';
import { GraphService } from './graph.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [GraphService],
})
export class AppModule { }
