function reviewHook(depsExpression) {
  const deps =
    depsExpression || "[$,Q,s,l,ft,Or,Dr,kr,jr,y,B,of,Y,Ae,Je,yi,vi,CPXBranchPickerDropdownContent,dp,xr,Ma]";
  return `var CPXRM=e=>self.CodexPlusHost.adapters.review.renderBodyFromHost(e,${deps});`;
}

module.exports = {
  reviewHook,
};
