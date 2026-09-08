import { IsIn } from 'class-validator';
import { VERIFICATION_REJECTION_REASONS, type VerificationRejectionReason } from '../verification-rejection-reasons';

export class RejectVerificationDto {
  @IsIn(VERIFICATION_REJECTION_REASONS)
  reason: VerificationRejectionReason;
}
