import { Controller, Get, Param } from '@nestjs/common';
import { InsightsService } from './insights.service';

@Controller('communities')
export class InsightsController {
  constructor(private insightsService: InsightsService) {}

  @Get(':id/insights')
  getCommunityInsights(@Param('id') id: string) {
    return this.insightsService.getCommunityInsights(id);
  }
}
