import { Controller, Get, Param } from '@nestjs/common';
import { InstancesService } from './instances.service';

@Controller('instances')
export class InstancesController {
  constructor(private instancesService: InstancesService) {}

  @Get()
  list() {
    return this.instancesService.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.instancesService.findOne(id);
  }

  @Get(':id/groups')
  listGroups(@Param('id') id: string) {
    return this.instancesService.listGroups(id);
  }
}
