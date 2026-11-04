// Fixed wording is not required, but orchard scope must remain explicit.
// These conservative text guards supplement the prompt; they are not a semantic fact checker.
export function hasOrchardScope(text) {
  return /과수원|여러 나무/u.test(text)
    && /(?:내|나의|나만|어느 나무)[^.!?\n]{0,100}(?:모르|어렵|알 수 없|확인할 수 없|구분할 수 없)/u.test(text);
}

export function claimsFarmerConfirmation(text) {
  return /농부[^.!?\n]{0,40}(?:확인했|확인한|확인해\s?줬|확인해\s?주었|확인됐|확인되었)/u.test(text);
}
