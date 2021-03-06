![img](https://github.com/madeiramadeirabr/action-generate-release/blob/production/img/action-generate-release.svg)
# action-generate-release

## Descrição
Esta action calcula as mudanças em releases usando o padrão de conventional commits como base e a soma da última tag liberada, se nenhuma tag foi liberada, a action usa o cálculo da release atual como a nova release.

## Squad:
[SRE Team](https://github.com/orgs/madeiramadeirabr/teams/team-platform-services 'SRE Team')

## Requisitos:
- Utilizar o padrão de conventional commits ao realizar commits
- A permissão do fluxo de trabalho de leitura e escrita deve está ativa conforme mostrado nas imagens abaixo

![img](https://github.com/madeiramadeirabr/action-generate-release/blob/production/img/settings.png)

![img](https://github.com/madeiramadeirabr/action-generate-release/blob/production/img/workflows_permissions.png)

## Diagrama:
![img](https://github.com/madeiramadeirabr/action-generate-release/blob/production/img/diagram.png)

## Exemplo de uso
```yml
uses: madeiramadeirabr/action-generate-release@1.0.0
with:
    github-token: ${{ secrets.GITHUB_TOKEN }}    
```