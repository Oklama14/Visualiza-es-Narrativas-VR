Plataforma Nilo Peçanha - Dicionário de dados

Descrição: Tabela de calendário da plataforma Nilo Peçanha. Esta tabela é utilizada como

referência de data para todo os dados disponíveis.

dCalendário

Autor: Poty Lucena

Data: 15/05/2023

Versão: 2

Nome: Ano

Tipo: Int64

Descrição: Ano de referência

Descrição: A tabela d_IES é uma tabela que contém informações sobre as Instituições de Ensino

d_IES

Superior (IES) do Brasil.

Autor: dsbr

Data: 03/11/2022

Versão: 1

Nome: Região

Tipo: String

Descrição: Nome da região do Brasil em que a Instituição está situada

Nome: UF

Tipo: String

Descrição: Unidade Federativa (UF) da Instituição

Nome: Estado

Tipo: String

Descrição: Nome do estado do Brasil em que a Instituição está situada

Dicionário de dados produzido automaticamente

Gerado em: sábado, 13 de junho de 2026

Página: 1 de 5

Plataforma Nilo Peçanha - Dicionário de dados

Nome: Organização Acadêmica PNP

Tipo: String

d_IES

Descrição: Designação da organização acadêmica das instituições no âmbito da PNP, que podem

ser classiﬁcadas como Instituto Federal (IF), Centro Federal de Educação Tecnológica (Cefet),

Escola técnica vinculada (ETV) ou Colégio Pedro II (CPII)

Nome: Instituição (Nome)

Tipo: String

Descrição: Nome da Instituição de Ensino Superior

Descrição: A tabela dimUnidade possui informações geográﬁcas e da evolução dos nomes sobre as

unidades de ensino superior no Brasil.

dimUnidade

Autor: dsbr

Data: 03/11/2022

Versão: 1

Nome: Instituicao

Tipo: String

Nome: nomeUnidadeRecente

Tipo: String

Descrição: Nome da unidade de ensino, conforme última edição disponível

fSituaçãoMatrícula

Descrição: Essa tabela é utilizada para armazenar informações sobre as matrículas realizadas pelos

alunos em uma instituição de ensino, permitindo a análise de diversos aspectos relacionados à

situação acadêmica dos alunos. As colunas representam informações como a unidade onde a

Dicionário de dados produzido automaticamente

Gerado em: sábado, 13 de junho de 2026

Página: 2 de 5

Plataforma Nilo Peçanha - Dicionário de dados

fSituaçãoMatrícula

matrícula foi realizada, o curso em que o aluno está matriculado, a situação da matrícula e a data

em que a matrícula foi realizada ou atualizada.

Autor: dsbr

Data: 03/11/2022

Versão: 1

Nome: Eﬁciência Acadêmica | Concluídos

Tipo: Measure

Expressão: CALCULATE(fEﬁcienciaAcademica[Eﬁciência Acadêmica | Número de Matrículas],

dimSituacao[categoriaSituacao] = "Concluintes")

Autor: dsbr

Data: 29/05/2023

Versão: 1

Descrição: Número de CONCLUINTES, em relação às matrículas vinculadas aos ciclos concluídos

no ano anterior ao ano de referência.

Nome: Eﬁciência Acadêmica | Concluídos %

Tipo: Measure

Expressão: divide([Eﬁciência Acadêmica | Concluídos], [Eﬁciência Acadêmica | Número de

Matrículas])

Autor: dsbr

Data: 29/05/2023

Versão: 1

Descrição: Percentual de CONCLUINTES, em relação às matrículas vinculadas aos ciclos

concluídos no ano anterior ao ano de referência.

Nome: Eﬁciência Acadêmica | Índice de Eﬁciência Acadêmica %

Tipo: Measure

Expressão: [Eﬁciência Acadêmica | Concluídos %] +

DIVIDE(

    ([Eﬁciência Acadêmica | Retidos %]*[Eﬁciência Acadêmica | Concluídos %]),

Dicionário de dados produzido automaticamente

Gerado em: sábado, 13 de junho de 2026

Página: 3 de 5

Plataforma Nilo Peçanha - Dicionário de dados

    ([Eﬁciência Acadêmica | Concluídos %]+[Eﬁciência Acadêmica | Taxa de Evasão %])

fSituaçãoMatrícula

    )

Autor: dsbr

Data: 03/11/2022

Versão: 1

Descrição: Este indicador mede o percentual de alunos que concluíram o curso com êxito dentro

do período previsto (+ 1 ano), acrescido de um percentual (projeção) dos alunos retidos no ano de

referência que poderão concluir o curso. São considerados apenas os alunos matriculados em

ciclos de matrícula com término previsto para o ano anterior ao Ano de Referência, sendo que para

este cálculo é empregado o conceito de matrícula e não de matrícula equivalente.

Nome: Eﬁciência Acadêmica | Número de Evadidos

Tipo: Measure

Expressão: CALCULATE(fEﬁcienciaAcademica[Eﬁciência Acadêmica | Número de Matrículas],

dimSituacao[categoriaSituacao] = "Evadidos")

Autor: dsbr

Data: 29/05/2023

Versão: 1

Descrição: Número de EVADIDOS em relação às matrículas vinculadas aos ciclos concluídos no

ano anterior ao ano de referência.

Nome: Eﬁciência Acadêmica | Retidos

Tipo: Measure

Expressão: CALCULATE(SUM(fEﬁcienciaAcademica[numMatriculas]), dimSituacao[FluxoRetido] =

"Retido")

Autor: dsbr

Data: 29/05/2023

Versão: 1

Descrição: Número de matriculados que são classiﬁcados como RETIDOS por terem ultrapassado

o período previsto para integralização do curso (acrescido de um ano) em relação às matrículas

vinculadas aos ciclos concluídos no anterior ao Ano de referência.

Dicionário de dados produzido automaticamente

Gerado em: sábado, 13 de junho de 2026

Página: 4 de 5

Plataforma Nilo Peçanha - Dicionário de dados

Nome: Eﬁciência Acadêmica | Retidos %

Tipo: Measure

fSituaçãoMatrícula

Expressão: Divide('fSituaçãoMatrícula'[Eﬁciência Acadêmica | Retidos], [Eﬁciência Acadêmica |

Número de Matrículas])

Autor: dsbr

Data: 29/05/2023

Versão: 1

Descrição: Percentual de matriculados que são classiﬁcados como RETIDOS por terem

ultrapassado o período previsto para integralização do curso (acrescido de um ano) em relação às

matrículas vinculadas aos ciclos concluídos no ano anterior ao ano de referência.

Nome: Eﬁciência Acadêmica | Taxa de Evasão %

Tipo: Measure

Expressão: Divide([Eﬁciência Acadêmica | Número de Evadidos], [Eﬁciência Acadêmica | Número

de Matrículas])

Autor: dsbr

Data: 29/05/2023

Versão: 1

Descrição: Percentual de EVADIDOS, em relação às matrículas vinculadas aos ciclos concluídos no

ano anterior ao ano de referência.

Dicionário de dados produzido automaticamente

Gerado em: sábado, 13 de junho de 2026

Página: 5 de 5

