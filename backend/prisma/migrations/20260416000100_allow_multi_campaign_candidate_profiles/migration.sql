-- Allow one user to participate in multiple campaigns.
-- Previous schema allowed only one CandidateProfile per user.

-- Drop single-column uniqueness on userId.
ALTER TABLE "CandidateProfile"
DROP CONSTRAINT IF EXISTS "CandidateProfile_userId_key";

-- Prevent duplicate enrollment of the same user in the same campaign.
CREATE UNIQUE INDEX IF NOT EXISTS "CandidateProfile_userId_campaignId_key"
ON "CandidateProfile"("userId", "campaignId");
