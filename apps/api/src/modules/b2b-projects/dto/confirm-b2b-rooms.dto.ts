import { IsInt, Min } from 'class-validator';

export class ConfirmB2BRoomsDto {
  @IsInt()
  @Min(0)
  roomsRevision!: number;
}
