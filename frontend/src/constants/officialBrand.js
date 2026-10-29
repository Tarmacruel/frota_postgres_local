export const officialBrand = {
  city: 'Teixeira de Freitas',
  state: 'BA',
  municipality: 'Prefeitura Municipal de Teixeira de Freitas',
  systemName: 'Frota PMTF',
  subtitle: 'Sistema oficial de gestão da frota municipal',
  administrationSecretariat: 'Secretaria Municipal de Administração',
  fleetDepartment: 'Setor de Frotas',
  logoPath: '/brasao-pmtf.png',
  addressLine: 'Avenida Marechal Castelo Branco, 145 - Centro, Teixeira de Freitas - BA, CEP 45995-041',
  cnpj: '13.650.403/0001-28',
  reportFooter: 'Prefeitura Municipal de Teixeira de Freitas | Avenida Marechal Castelo Branco, 145 - Centro | CNPJ 13.650.403/0001-28',
  colors: {
    royalBlue: '#2452e8',
    royalBlueDark: '#1739b7',
    royalBlueDeep: '#0d2272',
    ink: '#20304a',
    softInk: '#66758c',
  },
}

export function applyOfficialBrand(values) {
  if (!values?.identity) return
  Object.assign(officialBrand, values.identity)
  officialBrand.reportFooter = `${officialBrand.municipality} | ${officialBrand.addressLine} | CNPJ ${officialBrand.cnpj}`
  officialBrand.colors.royalBlue = values.appearance?.primary || '#2452e8'
}
