import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum DestinationType {
  ANNOUNCEMENT_CHANNEL = 'ANNOUNCEMENT_CHANNEL',
  GROUP = 'GROUP',
  MULTI_GROUP = 'MULTI_GROUP',
}

export class CreateMessageDto {
  @IsString()
  instanceId!: string;

  @IsEnum(DestinationType)
  destinationType!: DestinationType;

  @ValidateIf((o) => o.destinationType === DestinationType.ANNOUNCEMENT_CHANNEL)
  @IsString()
  communityId?: string;

  @ValidateIf((o) => o.destinationType === DestinationType.GROUP)
  @IsString()
  groupId?: string;

  @ValidateIf((o) => o.destinationType === DestinationType.MULTI_GROUP)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  groupIds?: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(4096) // limite de texto WhatsApp
  content!: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  // ISO datetime. Se omitido ou no passado, considera "enviar agora".
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  // Round 1: precisa enquanto auth não está protegida.
  // Round 3 sai daqui — vem do JWT.
  @IsString()
  createdById!: string;
}
