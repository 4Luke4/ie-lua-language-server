module.exports = async function reconcileLabels(github, context, definitions) {
  const scope={owner:context.repo.owner,repo:context.repo.repo};
  const existing=await github.paginate(github.rest.issues.listLabelsForRepo,{...scope,per_page:100});
  const byName=new Map(existing.map((label)=>[label.name.toLowerCase(),label]));
  for(const desired of definitions) {
    let current=byName.get(desired.name.toLowerCase());
    if(!current) {
      try {await github.rest.issues.createLabel({...scope,...desired});continue;}
      catch(error) {
        if(error.status!==422) throw error;
        // A concurrent reconciler may have created the label. Other failures still propagate.
        current=(await github.rest.issues.getLabel({...scope,name:desired.name})).data;
      }
    }
    if(current.name!==desired.name || current.color.toUpperCase()!==desired.color.toUpperCase() || (current.description??'')!==desired.description) {
      await github.rest.issues.updateLabel({...scope,name:current.name,new_name:desired.name,color:desired.color,description:desired.description});
    }
  }
};
