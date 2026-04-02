/*
  Warnings:

  - A unique constraint covering the columns `[attemptId,questionId]` on the table `MCQAnswer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TERMINATED');

-- AlterEnum
ALTER TYPE "InterviewMode" ADD VALUE 'LIVE_CODING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ViolationType" ADD VALUE 'NO_FACE';
ALTER TYPE "ViolationType" ADD VALUE 'FACE_MISMATCH';

-- DropForeignKey
ALTER TABLE "AttemptRecording" DROP CONSTRAINT "AttemptRecording_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "CodingSubmission" DROP CONSTRAINT "CodingSubmission_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "CodingSubmission" DROP CONSTRAINT "CodingSubmission_questionId_fkey";

-- DropForeignKey
ALTER TABLE "EmailLog" DROP CONSTRAINT "EmailLog_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "InterviewAnswer" DROP CONSTRAINT "InterviewAnswer_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "InterviewAnswer" DROP CONSTRAINT "InterviewAnswer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "MCQAnswer" DROP CONSTRAINT "MCQAnswer_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "MCQAnswer" DROP CONSTRAINT "MCQAnswer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionPool" DROP CONSTRAINT "QuestionPool_roundId_fkey";

-- DropForeignKey
ALTER TABLE "ScoreCard" DROP CONSTRAINT "ScoreCard_candidateId_fkey";

-- DropForeignKey
ALTER TABLE "StrikeEvent" DROP CONSTRAINT "StrikeEvent_candidateId_fkey";

-- AlterTable
ALTER TABLE "CandidateProfile" ADD COLUMN     "adminDecision" TEXT,
ADD COLUMN     "enrolledAt" TIMESTAMP(3),
ADD COLUMN     "enrollmentPhotoUrl" TEXT,
ADD COLUMN     "faceDescriptor" JSONB,
ADD COLUMN     "isForwarded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EmailLog" ALTER COLUMN "candidateId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "InterviewAnswer" ADD COLUMN     "codeLanguage" TEXT,
ADD COLUMN     "codeScore" DOUBLE PRECISION,
ADD COLUMN     "codeSubmission" TEXT,
ADD COLUMN     "communicationScore" DOUBLE PRECISION,
ADD COLUMN     "confidenceScore" DOUBLE PRECISION,
ADD COLUMN     "correctnessScore" DOUBLE PRECISION,
ADD COLUMN     "deliveryScore" DOUBLE PRECISION,
ADD COLUMN     "durationSeconds" DOUBLE PRECISION,
ADD COLUMN     "explainAudio" TEXT,
ADD COLUMN     "explainScore" DOUBLE PRECISION,
ADD COLUMN     "explainTranscript" TEXT,
ADD COLUMN     "fillerWordCount" INTEGER,
ADD COLUMN     "fillerWordRatio" DOUBLE PRECISION,
ADD COLUMN     "silenceRatio" DOUBLE PRECISION,
ADD COLUMN     "speechDuration" DOUBLE PRECISION,
ADD COLUMN     "wordCount" INTEGER,
ADD COLUMN     "wordsPerMinute" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "explanationPrompt" TEXT,
ADD COLUMN     "explanationRubric" TEXT,
ADD COLUMN     "liveCodingProblem" TEXT,
ADD COLUMN     "liveCodingStarter" JSONB,
ADD COLUMN     "liveCodingTestCases" JSONB,
ALTER COLUMN "isActive" SET DEFAULT false;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL,
    "type" "ViolationType" NOT NULL,
    "candidateId" TEXT NOT NULL,
    "sessionId" TEXT,
    "screenshotUrl" TEXT,
    "isStrike" BOOLEAN NOT NULL DEFAULT true,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_candidateId_idx" ON "Session"("candidateId");

-- CreateIndex
CREATE INDEX "Violation_candidateId_idx" ON "Violation"("candidateId");

-- CreateIndex
CREATE INDEX "Violation_sessionId_idx" ON "Violation"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "MCQAnswer_attemptId_questionId_key" ON "MCQAnswer"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "QuestionPool" ADD CONSTRAINT "QuestionPool_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "PipelineRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAttempt" ADD CONSTRAINT "CandidateAttempt_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "PipelineRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateAttempt" ADD CONSTRAINT "CandidateAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCQAnswer" ADD CONSTRAINT "MCQAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CandidateAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCQAnswer" ADD CONSTRAINT "MCQAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingSubmission" ADD CONSTRAINT "CodingSubmission_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CandidateAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodingSubmission" ADD CONSTRAINT "CodingSubmission_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAnswer" ADD CONSTRAINT "InterviewAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CandidateAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAnswer" ADD CONSTRAINT "InterviewAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrikeEvent" ADD CONSTRAINT "StrikeEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrikeEvent" ADD CONSTRAINT "StrikeEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CandidateAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptRecording" ADD CONSTRAINT "AttemptRecording_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CandidateAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreCard" ADD CONSTRAINT "ScoreCard_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
