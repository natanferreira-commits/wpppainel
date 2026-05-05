import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstancesService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.instance.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        communities: {
          select: { id: true, name: true, membersCount: true },
        },
        _count: { select: { groups: true } },
      },
    });
  }

  async findOne(id: string) {
    const instance = await this.prisma.instance.findUnique({
      where: { id },
      include: { communities: true },
    });
    if (!instance) throw new NotFoundException('Instância não encontrada');
    return instance;
  }

  async listGroups(instanceId: string) {
    await this.findOne(instanceId);
    return this.prisma.group.findMany({
      where: { instanceId },
      orderBy: [{ isAnnouncementChannel: 'desc' }, { name: 'asc' }],
      include: {
        community: { select: { id: true, name: true } },
      },
    });
  }
}
