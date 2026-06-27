function reviewHook(depsExpression) {
  const deps =
    depsExpression || "[$,Q,s,l,ft,Or,Dr,kr,jr,y,B,of,Y,Ae,Je,yi,vi,CPXBranchPickerDropdownContent,dp,xr,Ma]";
  return `let CPXR=window.CodexPlusHost.adapters.review,CPXRM=e=>CPXR.renderBodyFromHost(e,${deps});`;
}

module.exports = {
  reviewHook,
};
