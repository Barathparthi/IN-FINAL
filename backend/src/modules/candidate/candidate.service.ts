import { prisma } from '../../lib/prisma'
import { extractTextFromPdf } from '../../utils/file-upload.util'
import * as EmailService from '../email/email.service'
import bcrypt from 'bcryptjs'

export async function getMyProfile(candidateId: string) {
  const candidate = await prisma.candidateProfile.findUniqueOrThrow({
    where: { id: candidateId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      campaign: {
        select: {
          name: true,
          role: true,
          pipelineConfig: true,
          rounds: {
            orderBy: { order: 'asc' },
            select: { id: true, order: true, roundType: true, roundConfig: true, timeLimitMinutes: true, passMarkPercent: true },
          },
        },
      },
      attempts: {
        select: { roundId: true, status: true, percentScore: true, passed: true, startedAt: true, completedAt: true },
      },
    },
  })

  // Build enriched round list with live lock/unlock status
  const rounds = candidate.campaign.rounds.map((round, i) => {
    const attempt = candidate.attempts.find(a => a.roundId === round.id)
    const cfg = round.roundConfig as any

    // Round is unlocked if:
    // - It's Round 1 (always accessible), OR
    // - Previous round has a COMPLETED + passed attempt
    let unlocked = i === 0
    if (i > 0) {
      const prevRound = candidate.campaign.rounds[i - 1]
      const prevAttempt = candidate.attempts.find(a => a.roundId === prevRound.id)
      unlocked = !!(prevAttempt?.status === 'COMPLETED' && prevAttempt?.passed === true)
    }

    return {
      id: round.id,
      order: round.order,
      roundType: round.roundType,
      timeLimitMinutes: round.timeLimitMinutes,
      passMarkPercent: round.passMarkPercent,
      interviewMode: cfg?.interviewMode,
      questionCount: cfg ? (cfg.totalQuestions || cfg.problemCount || cfg.questionCount) : 0,
      unlocked,
      attempt: attempt ? {
        status: attempt.status,
        percentScore: attempt.percentScore,
        passed: attempt.passed,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
      } : null,
    }
  })

  const strikeCount = await prisma.strikeEvent.count({
    where: { candidateId, isStrike: true }
  })

  return {
    id: candidate.id,
    status: candidate.status,
    strikeCount,
    kycVerifiedAt: candidate.kycVerifiedAt,
    faceDescriptor: (candidate as any).faceDescriptor,
    user: candidate.user,
    campaign: {
      name: candidate.campaign.name,
      role: candidate.campaign.role,
      pipelineConfig: candidate.campaign.pipelineConfig,
    },
    rounds, // enriched with lock/unlock status
  }
}

import cloudinary from '../../lib/cloudinary'

export async function uploadResume(candidateId: string, fileBuffer: Buffer, mimeType: string) {
  const resumeText = await extractTextFromPdf(fileBuffer)

  // Upload to Cloudinary
  const result: any = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'resumes',
        resource_type: 'raw',
        public_id: `resume_${candidateId}.pdf`
      },
      (error, result) => {
        if (error) reject(error)
        else resolve(result)
      }
    )
    uploadStream.end(fileBuffer)
  })

  // Cloudinary blocks default free tier PDF viewing for security (XSS protection).
  // By generating a permanently signed delivery URL with sign_url=true, it overrides
  // that restriction and allows the recruiter to view the PDF directly in the browser!
  const resumeUrl = cloudinary.utils.url(result.public_id, {
    resource_type: 'raw',
    secure: true,
    sign_url: true
  })

  await prisma.candidateProfile.update({
    where: { id: candidateId },
    data: { resumeUrl, resumeText },
  })

  const profile = await prisma.candidateProfile.findUniqueOrThrow({
    where: { id: candidateId },
    include: { user: true },
  })

  if (!profile.user.mustChangePassword && profile.status === 'ONBOARDING' && profile.faceDescriptor) {
    await prisma.candidateProfile.update({
      where: { id: candidateId },
      data: { status: 'READY' },
    })
  }

  return { resumeUrl, resumeText: resumeText.slice(0, 200) + '...' }
}

export async function getOnboardingStatus(candidateId: string) {
  const profile = await prisma.candidateProfile.findUniqueOrThrow({
    where: { id: candidateId },
    include: { user: { select: { mustChangePassword: true } } },
  })

  return {
    passwordChanged: !profile.user.mustChangePassword,
    kycVerified: !!profile.kycVerifiedAt,
    resumeUploaded: !!profile.resumeUrl,
    status: profile.status,
    canStartTest: profile.status === 'READY' || profile.status === 'IN_PROGRESS',
  }
}

export async function sendKycOtp(candidateId: string) {
  const candidate = await prisma.candidateProfile.findUniqueOrThrow({
    where: { id: candidateId },
    include: { user: true }
  })

  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const otpHash = await bcrypt.hash(otp, 10)
  const otpExpiry = new Date(Date.now() + 15 * 60 * 1000) // 15 mins

  await prisma.user.update({
    where: { id: candidate.userId },
    data: { otpHash, otpExpiry }
  })

  try {
    await EmailService.sendKycOtpEmail({
      toEmail:   candidate.user.email,
      firstName: candidate.user.firstName,
      otpCode:   otp
    })
  } catch (emailErr: any) {
    // SMTP failure must not block the flow — OTP is already saved in the DB.
    // In development, print the OTP to the console so testing can continue.
    console.warn(`[KYC] Email delivery failed for ${candidate.user.email}: ${emailErr.message}`)
    console.warn(`[KYC] OTP for ${candidate.user.email}: ${otp}`)
  }

  return { message: 'OTP sent successfully' }
}

export async function verifyKycOtp(candidateId: string, otp: string) {
  const candidate = await prisma.candidateProfile.findUniqueOrThrow({
    where: { id: candidateId },
    include: { user: true }
  })

  if (!candidate.user.otpHash || !candidate.user.otpExpiry || candidate.user.otpExpiry < new Date()) {
    throw new Error('OTP expired or not found. Please request a new one.')
  }

  const isValid = await bcrypt.compare(otp, candidate.user.otpHash)
  if (!isValid) {
    throw new Error('Invalid verification code.')
  }

  await prisma.candidateProfile.update({
    where: { id: candidateId },
    data: { kycVerifiedAt: new Date() }
  })

  // Clear OTP
  await prisma.user.update({
    where: { id: candidate.userId },
    data: { otpHash: null, otpExpiry: null }
  })

  return { message: 'Email verified successfully' }
}

export async function saveIdentity(candidateId: string, descriptor: any, photoUrl: string) {
  const updated = await prisma.candidateProfile.update({
    where: { id: candidateId },
    data: {
      faceDescriptor: descriptor,
      enrollmentPhotoUrl: photoUrl,
      enrolledAt: new Date(),
    },
    include: { user: true }
  })

  if (!updated.user.mustChangePassword && updated.status === 'ONBOARDING' && updated.resumeUrl && updated.kycVerifiedAt) {
    return prisma.candidateProfile.update({
      where: { id: candidateId },
      data: { status: 'READY' },
    })
  }

  return updated
}