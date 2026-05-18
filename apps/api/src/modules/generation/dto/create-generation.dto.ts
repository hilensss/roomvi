import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { InteriorStyle, RoomType } from '@roomvi/database';
import { Type } from 'class-transformer';
export class CreateGenerationDto {
  @IsEnum(RoomType) roomType!: RoomType;
  @IsEnum(InteriorStyle) style!: InteriorStyle;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) budgetMin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) budgetMax?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(2000)
  widthCm?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(2000)
  heightCm?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(2000)
  depthCm?: number;
  @IsOptional() @IsString() sourceImageUrl?: string;
}
