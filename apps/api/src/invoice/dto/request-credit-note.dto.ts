import { IsString, MinLength } from 'class-validator';

export class RequestCreditNoteDto {
  @IsString()
  @MinLength(1)
  notes!: string;
}
