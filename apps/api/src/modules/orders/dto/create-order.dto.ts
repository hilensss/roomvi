import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @Length(2, 120)
  customerName!: string;

  @IsEmail()
  @MaxLength(254)
  customerEmail!: string;

  @IsString()
  @Length(5, 32)
  customerPhone!: string;

  @IsString()
  @Length(2, 120)
  deliveryCity!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  deliveryAddress!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  deliveryPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  deliveryComment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerComment?: string;
}
