import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto, DestinationType } from './dto/create-message.dto';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateMessageDto) {
    // Validações de destino conforme tipo
    const targetGroupIds = await this.resolveTargetGroupIds(dto);

    // Quando enviar
    const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : new Date();
    if (dto.scheduledFor && scheduledFor < new Date()) {
      // RN-03: agendar pra passado não é permitido (mas "enviar agora" sem
      // scheduledFor é OK — usa now)
      throw new BadRequestException('Data de agendamento não pode ser no passado');
    }

    // Cria mensagem + targets numa transação
    const message = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          instanceId: dto.instanceId,
          communityId: dto.communityId ?? null,
          destinationType: dto.destinationType,
          content: dto.content,
          imageUrl: dto.imageUrl ?? null,
          scheduledFor,
          status: 'SCHEDULED',
          createdById: dto.createdById,
          targets: {
            create: targetGroupIds.map((groupId) => ({
              groupId,
              status: 'SCHEDULED',
            })),
          },
        },
        include: {
          targets: { include: { group: true } },
          instance: true,
          community: true,
        },
      });
      return m;
    });

    return message;
  }

  // Resolve quais grupos vão ser efetivamente alvo do envio.
  // Pra ANNOUNCEMENT_CHANNEL: pega o grupo isAnnouncementChannel da comunidade.
  // Pra GROUP: 1 grupo.
  // Pra MULTI_GROUP: N grupos.
  private async resolveTargetGroupIds(dto: CreateMessageDto): Promise<string[]> {
    if (dto.destinationType === DestinationType.ANNOUNCEMENT_CHANNEL) {
      if (!dto.communityId) {
        throw new BadRequestException('communityId é obrigatório pra ANNOUNCEMENT_CHANNEL');
      }
      const channel = await this.prisma.group.findFirst({
        where: {
          communityId: dto.communityId,
          isAnnouncementChannel: true,
        },
      });
      if (!channel) {
        throw new NotFoundException('Comunidade não tem canal de anúncios cadastrado');
      }
      return [channel.id];
    }

    if (dto.destinationType === DestinationType.GROUP) {
      if (!dto.groupId) {
        throw new BadRequestException('groupId é obrigatório pra GROUP');
      }
      return [dto.groupId];
    }

    if (dto.destinationType === DestinationType.MULTI_GROUP) {
      if (!dto.groupIds?.length) {
        throw new BadRequestException('groupIds é obrigatório pra MULTI_GROUP');
      }
      return dto.groupIds;
    }

    throw new BadRequestException('destinationType inválido');
  }

  async list(filters: { status?: string; instanceId?: string; limit?: number } = {}) {
    return this.prisma.message.findMany({
      where: {
        status: filters.status,
        instanceId: filters.instanceId,
      },
      orderBy: [{ scheduledFor: 'desc' }],
      take: filters.limit ?? 100,
      include: {
        instance: { select: { id: true, name: true } },
        community: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        targets: {
          include: {
            group: { select: { id: true, name: true, isAnnouncementChannel: true } },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: {
        instance: true,
        community: true,
        createdBy: true,
        targets: { include: { group: true } },
      },
    });
    if (!message) throw new NotFoundException('Mensagem não encontrada');
    return message;
  }
}
