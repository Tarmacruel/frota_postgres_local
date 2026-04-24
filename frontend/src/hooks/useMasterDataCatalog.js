import { useEffect, useMemo, useState } from 'react'
import { masterDataAPI } from '../api/masterData'
import { getApiErrorMessage } from '../utils/apiError'

function flattenCatalog(organizations) {
  const departments = []
  const allocations = []

  organizations.forEach((organization) => {
    organization.departments.forEach((department) => {
      departments.push({
        ...department,
        organization_id: organization.id,
        organization_name: organization.name,
      })

      department.allocations.forEach((allocation) => {
        allocations.push({
          ...allocation,
          organization_id: organization.id,
          organization_name: organization.name,
          department_id: department.id,
          department_name: department.name,
          display_name: allocation.display_name || `${organization.name} - ${department.name} - ${allocation.name}`,
        })
      })
    })
  })

  return { departments, allocations }
}

export function useMasterDataCatalog() {
  const [organizations, setOrganizations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload() {
    try {
      setLoading(true)
      setError('')
      const { data } = await masterDataAPI.getCatalog()
      setOrganizations(data.organizations || [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar os cadastros de lotacao.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const { departments, allocations } = useMemo(() => flattenCatalog(organizations), [organizations])

  function getDepartmentsByOrganization(organizationId) {
    if (!organizationId) return departments
    return departments.filter((department) => department.organization_id === organizationId)
  }

  function getAllocationsByDepartment(departmentId) {
    if (!departmentId) return allocations
    return allocations.filter((allocation) => allocation.department_id === departmentId)
  }

  function findOrganization(organizationId) {
    return organizations.find((organization) => organization.id === organizationId) || null
  }

  function findDepartment(departmentId) {
    return departments.find((department) => department.id === departmentId) || null
  }

  function findAllocation(allocationId) {
    return allocations.find((allocation) => allocation.id === allocationId) || null
  }

  return {
    organizations,
    departments,
    allocations,
    loading,
    error,
    reload,
    getDepartmentsByOrganization,
    getAllocationsByDepartment,
    findOrganization,
    findDepartment,
    findAllocation,
  }
}
