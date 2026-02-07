import type { FC } from 'react'

export interface ReasoningTraceProps {
  steps: string[]
  sources?: string[]
}

declare const ReasoningTrace: FC<ReasoningTraceProps>
export default ReasoningTrace
