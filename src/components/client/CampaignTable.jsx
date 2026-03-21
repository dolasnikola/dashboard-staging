import { METRIC_LABELS, fmtMetric } from '../../lib/data'

export default function CampaignTable({ rows, columns, currency }) {
  if (!rows || rows.length === 0) return null

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
            <tr key={i}>
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
