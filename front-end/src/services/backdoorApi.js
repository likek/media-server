import request from './request'

export const getBackdoorMenuStatus = async () => {
  const response = await request.post('/backdoor/menuStatus', {})
  return response
}

export const recordHomeTapCount = async (count) => {
  const response = await request.post('/backdoor/homeTap', { count })
  return response
}
