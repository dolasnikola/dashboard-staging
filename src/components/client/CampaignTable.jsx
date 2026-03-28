import { memo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { METRIC_LABELS, fmtMetric } from '../../lib/data'

const VIRTUALIZE_THRESHOLD = 50

export default memo(function CampaignTable({ rows, columns, currency }) {
  if (!rows || rows.length === 0) return null

  if (rows.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c}>
                  {c === 'campaign' ? 'Campaign' : c === 'insertion_order' ? 'Insertion Order' : METRIC_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.campaign}_${r.insertion_order || ''}_${i}`}>
                {columns.map(c => (
                  <td key={c}>
                    {c === 'campaign' ? r.campaign : c === 'insertion_order' ? (r.insertion_order || '') : fmtMetric(c, r[c], currency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return <VirtualizedTable rows={rows} columns={columns} currency={currency} />
})

function VirtualizedTable({ rows, columns, currency }) {
  const parentRef = useRef(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  })

  return (
    <div className="data-table-wrap" ref={parentRef} style={{ maxHeight: 600, overflow: 'auto' }}>
      <table className="data-table">
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <tr>
            {columns.map(c => (
              <th key={c}>
                {c === 'campaign' ? 'Campaign' : c === 'insertion_order' ? 'Insertion Order' : METRIC_LABELS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {/* Spacer for rows above viewport */}
          {virtualizer.getVirtualItems()[0]?.start > 0 && (
            <tr style={{ height: virtualizer.getVirtualItems()[0].start }}>
              <td colSpan={columns.length} style={{ padding: 0, border: 'none' }} />
            </tr>
          )}
          {virtualizer.getVirtualItems().map(virtualRow => {
            const r = rows[virtualRow.index]
            return (
              <tr key={virtualRow.index} data-index={virtualRow.index}>
                {columns.map(c => (
                  <td key={c}>
                    {c === 'campaign' ? r.campaign : c === 'insertion_order' ? (r.insertion_order || '') : fmtMetric(c, r[c], currency)}
                  </td>
                ))}
              </tr>
            )
          })}
          {/* Spacer for rows below viewport */}
          {(() => {
            const items = virtualizer.getVirtualItems()
            const lastItem = items[items.length - 1]
            const remaining = lastItem ? virtualizer.getTotalSize() - lastItem.end : 0
            return remaining > 0 ? (
              <tr style={{ height: remaining }}>
                <td colSpan={columns.length} style={{ padding: 0, border: 'none' }} />
              </tr>
            ) : null
          })()}
        </tbody>
      </table>
    </div>
  )
}
