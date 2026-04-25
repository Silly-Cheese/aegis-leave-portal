export async function getUserWithPermissions(db, uid) {
  const { doc, getDoc, collection, getDocs } = await import("https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js");

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;

  const rawUser = snap.data();
  const accountType = rawUser.accountType || rawUser.account_type || rawUser.type || "";
  const role = String(rawUser.role || "").trim().toLowerCase();
  const companyId = rawUser.companyId || rawUser.company_id || "";

  const user = {
    ...rawUser,
    uid: rawUser.uid || uid,
    accountType,
    companyId,
    role
  };

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

  if (accountType === "managing_company") {
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

  if (accountType === "customer") {
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

  try {
    const rolesSnap = await getDocs(collection(db, "customRoles"));
    rolesSnap.forEach((roleDoc) => {
      const roleData = roleDoc.data();
      if (
        String(roleData.roleId || "").toLowerCase() === role &&
        roleData.companyId === companyId &&
        roleData.active !== false
      ) {
        Object.assign(permissions, roleData.permissions || {});
      }
    });
  } catch (error) {
    console.warn("Custom role permissions could not be loaded. Base permissions were applied.", error);
  }

  return { ...user, permissions };
}
