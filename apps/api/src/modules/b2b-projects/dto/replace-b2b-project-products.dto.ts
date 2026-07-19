import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

export class ReplaceB2BProjectProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  productIds!: string[];
}
