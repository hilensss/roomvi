import { IsOptional, IsString } from 'class-validator';
export class SyncMockSupplierDto {
  @IsOptional() @IsString() supplierSlug?: string;
}
