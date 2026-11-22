// Report one optional editorial summary of existing DIFF evidence. Never count
// this as another rule hit or repair. Inputs must belong to the same scan/viewport.
export function describeLayoutPattern(rows) {
  const sequence=rows.find(x=>x.ruleId==='DIFF-001');
  const grid=rows.find(x=>x.ruleId==='DIFF-009');
  if(sequence?.status!=='observed' || !sequence.referenceMatch ||
     grid?.status!=='needs-review' || !grid.evidence.length) return null;
  const [match]=sequence.evidence;
  return {kind:'observation',weight:0,ruleIds:['DIFF-001','DIFF-009'],
    text:'The section order resembles '+match.reference+'; '+grid.evidence.length+' mapped sections use feature cards.',
    evidence:{reference:match.reference,version:match.version,matched:match.matched,total:match.total,
      sections:grid.evidence.map(x=>x.selector)}};
}
