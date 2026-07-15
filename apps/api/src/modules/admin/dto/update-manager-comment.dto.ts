import {
  IsDefined,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateManagerCommentDto {
  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsString()
  @MaxLength(2000)
  managerComment!: string | null;
}
