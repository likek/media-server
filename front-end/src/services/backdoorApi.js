import request from './request'

export const getBackdoorMenuStatus = async () => {
  const response = await request.p('/backdoor/menuStatus', {})
  return response
}

export const recordHomeTapCount = async (count) => {
  const response = await request.p('/backdoor/homeTap', { count })
  return response
}
