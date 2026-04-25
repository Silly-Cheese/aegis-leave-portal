export async function getUserWithPermissions(db, uid) {
  const { doc, getDoc, collection, getDocs } = await import("https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js");

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;

  const user = snap.data();
  const role = String(user.role || "").trim().toLowerCase();

  const permissions = {
    canApproveLoas: false,
    canEndLoasEarly: false,
    canCreateLoasForOthers: false,
    canDeleteLoas: false,
    canViewCompanyRecords: true,
    canManageUsers: false,
    canManageCompanies: false,
    canViewAuditLogs: false,
    canCreateCustomRoles: false
  };

  if (user.accountType === "managing_company") {
    if (["owner", "account_manager"].includes(role)) {
      Object.keys(permissions).forEach((key) => permissions[key] = true);
    }

    if (role === "role_setter") {
      permissions.canCreateCustomRoles = true;
      permissions.canViewCompanyRecords = true;
    }

    if (role === "community_manager") {
      permissions.canManageUsers = true;
      permissions.canViewCompanyRecords = true;
    }

    if (role === "staff") {
      permissions.canViewCompanyRecords = true;
    }
  }

  if (user.accountType === "customer") {
    if (role === "company_owner") {
      Object.assign(permissions, {
        canApproveLoas: true,
        canEndLoasEarly: true,
        canCreateLoasForOthers: true,
        canDeleteLoas: true,
        canViewCompanyRecords: true,
        canManageUsers: true
      });
    }

    if (role === "loa_manager") {
      Object.assign(permissions, {
        canApproveLoas: true,
        canEndLoasEarly: true,
        canCreateLoasForOthers: true,
        canViewCompanyRecords: true
      });
    }
  }

  const rolesSnap = await getDocs(collection(db, "customRoles"));
  rolesSnap.forEach((roleDoc) => {
    const roleData = roleDoc.data();
    if (
      roleData.roleId === user.role &&
      roleData.companyId === user.companyId &&
      roleData.active !== false
    ) {
      Object.assign(permissions, roleData.permissions || {});
    }
  });

  return { ...user, permissions };
}
