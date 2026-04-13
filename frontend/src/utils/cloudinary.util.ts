import { proctoringApi } from '../services/api.services'
import { ENV } from '../config/env.config'

export const uploadToCloudinary = async (file: File | Blob | string, folder: string = 'indium_uploads'): Promise<string> => {
  // 1. Get signature from backend
  const { signature, timestamp, apiKey, cloudName } = await proctoringApi.getCloudinarySignature({ folder })

  // Use Cloud Name from ENV if defined, otherwise fallback to what backend said
  const finalCloudName = ENV.CLOUDINARY_CLOUD_NAME || cloudName
  const url = `https://api.cloudinary.com/v1_1/${finalCloudName}/auto/upload`

  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder', folder)
  formData.append('signature', signature)
  formData.append('timestamp', timestamp)
  formData.append('api_key', apiKey)

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error?.message || 'Failed to upload to Cloudinary')
  }

  const data = await response.json()
  return data.secure_url
}
