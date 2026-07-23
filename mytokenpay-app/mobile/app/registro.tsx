import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

export default function RegistroRedirect() {
  const router = useRouter()
  const params = useLocalSearchParams<{ tipo?: string }>()

  useEffect(() => {
    router.replace({ pathname: '/login', params: { mode: 'signup', tipo: params.tipo ?? '' } })
  }, [])

  return null
}
