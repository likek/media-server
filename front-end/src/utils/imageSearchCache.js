const imageSearchResultCache = new Map()

export const stashImageSearchResult = (token, files = []) => {
  if (!token) return
  imageSearchResultCache.set(String(token), Array.isArray(files) ? [...files] : [])
}

export const takeImageSearchResult = (token) => {
  if (!token) return null
  const cacheKey = String(token)
  const cached = imageSearchResultCache.get(cacheKey)
  imageSearchResultCache.delete(cacheKey)
  return cached ? [...cached] : null
}
