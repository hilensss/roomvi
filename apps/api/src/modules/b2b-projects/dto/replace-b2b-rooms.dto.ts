import { Type } from 'class-transformer';
import {
  B2BOpeningKind,
  InteriorStyle,
  RoomType,
} from '@roomvi/database';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class B2BRoomPointDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  y!: number;
}

export class B2BRoomOpeningDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsEnum(B2BOpeningKind)
  kind!: B2BOpeningKind;

  @IsInt()
  @Min(0)
  wallSegmentIndex!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  positionRatio!: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(1000)
  widthCm?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  recognitionConfidence?: number | null;
}

export class B2BRoomDraftDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceLabel?: string | null;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEnum(RoomType)
  roomType?: RoomType | null;

  @IsOptional()
  @IsEnum(InteriorStyle)
  styleOverride?: InteriorStyle | null;

  @IsOptional()
  @IsInt()
  @Min(80)
  @Max(5000)
  widthCm?: number | null;

  @IsOptional()
  @IsInt()
  @Min(80)
  @Max(5000)
  depthCm?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  areaM2?: number | null;

  @IsOptional()
  @IsInt()
  @Min(180)
  @Max(600)
  ceilingHeightCm?: number | null;

  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => B2BRoomPointDto)
  polygon!: B2BRoomPointDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  recognitionConfidence?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  recognitionNotes?: string | null;

  @IsBoolean()
  isIncluded!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => B2BRoomOpeningDto)
  openings!: B2BRoomOpeningDto[];
}

export class ReplaceB2BRoomsDto {
  @IsInt()
  @Min(0)
  roomsRevision!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => B2BRoomDraftDto)
  rooms!: B2BRoomDraftDto[];
}
