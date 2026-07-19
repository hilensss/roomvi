import { InteriorStyle, RoomType } from '@roomvi/database';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateB2BProjectDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  partnerName!: string;

  @IsUUID()
  supplierId!: string;

  @IsEnum(RoomType)
  roomType!: RoomType;

  @IsEnum(InteriorStyle)
  style!: InteriorStyle;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  managerComment?: string;
}
