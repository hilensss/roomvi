import {
  B2BProjectType,
  InteriorStyle,
  RoomType,
} from '@roomvi/database';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateB2BProjectDto {
  @IsEnum(B2BProjectType)
  type: B2BProjectType = B2BProjectType.FURNITURE_LINE;

  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  partnerName!: string;

  @ValidateIf(
    (value: CreateB2BProjectDto) =>
      value.type === B2BProjectType.FURNITURE_LINE ||
      value.supplierId !== undefined,
  )
  @IsUUID()
  supplierId?: string;

  @ValidateIf(
    (value: CreateB2BProjectDto) =>
      value.type === B2BProjectType.FURNITURE_LINE ||
      value.roomType !== undefined,
  )
  @IsEnum(RoomType)
  roomType?: RoomType;

  @IsEnum(InteriorStyle)
  style!: InteriorStyle;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  managerComment?: string;

  @ValidateIf(
    (value: CreateB2BProjectDto) =>
      value.type === B2BProjectType.DEVELOPER_FLOOR_PLAN ||
      value.sourceImageUrl !== undefined,
  )
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
  })
  sourceImageUrl?: string;

  @ValidateIf(
    (value: CreateB2BProjectDto) =>
      value.type === B2BProjectType.DEVELOPER_FLOOR_PLAN ||
      value.defaultCeilingHeightCm !== undefined,
  )
  @IsInt()
  @Min(200)
  @Max(500)
  defaultCeilingHeightCm?: number;
}
