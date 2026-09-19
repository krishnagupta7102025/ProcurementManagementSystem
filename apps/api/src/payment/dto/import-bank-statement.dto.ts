import { IsString, MinLength } from 'class-validator';

export class ImportBankStatementDto {
  // Raw CSV text: date,description,amountMinorUnits,reference (header row
  // required). Amount is in integer minor units, matching every other
  // money field in this app — not decimal currency.
  @IsString()
  @MinLength(1)
  csv!: string;
}
