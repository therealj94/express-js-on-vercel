import { View } from 'react-native'
import { Card } from './ui/Card'
import { Skeleton } from './ui/Skeleton'

export function CompanyCardSkeleton() {
  return (
    <Card style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Skeleton width={46} height={46} round="md" />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={11} />
        </View>
      </View>
      <View style={{ marginTop: 14, gap: 6 }}>
        <Skeleton height={12} />
        <Skeleton width="80%" height={12} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
        <Skeleton width={64} height={22} round="full" />
        <Skeleton width={82} height={22} round="full" />
      </View>
    </Card>
  )
}
