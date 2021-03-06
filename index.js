const { Octokit } = require("@octokit/core")
const github = require('@actions/github')
const core = require('@actions/core')
const githubToken = core.getInput('github-token')
const octokit = new Octokit({ auth: githubToken})

var major = 0
var minor = 0
var patch = 0
var contentRelease = `## What's Changed \n`

async function run (){
    if(githubToken){
        let branch_event = github.context.payload.ref.split('/')[2]
        if(branch_event == github.context.payload.repository.default_branch){
            try{
                let {id} = github.context.payload.commits[0]
                let {number, milestone} = await getNumberPullRequestByCommit(id)
                if(number != null){
                    let {last_release, body, id} = await getRelease(milestone)
                    calculateAndPrepareContentRelease(number, last_release, body, id)
                }
            }catch(error){
                core.setFailed('Não há pull request associado a este commit!')
            }
        }else{
            core.setFailed('Esta action só será executada quando a branch for mesclada com a branch padrão!')
        }
    }else{
        core.setFailed('O token do Github é obrigatório!')
    }    
}

async function calculateAndPrepareContentRelease(numberPullRequest, last_release, body, id){
    let dataCommits = await getCommits(numberPullRequest)
    contentRelease = body != null ? body : contentRelease
    let fullChange = ''
    if(contentRelease.length > 19){ 
        fullChange = await getFullChange(contentRelease)        
        contentRelease = contentRelease.replace(/\**\Full Changelog\**\:[\s\S]+|feat\(.+\):[\s\S]+/, "")
    }
    dataCommits.data.map(async (dataCommit)=>{
        let {commit} = dataCommit
        let {message} = commit
        countSemanticRelease(message)
    })
    
    let lastTag = await findTag()
    
    if(lastTag == null){
        if(major != 0){
            minor = 0
            patch = 0
        }
    
        if(major == 0 && minor != 0){
            patch = 0
        } 
    }

    let nextRelease = lastTag != undefined && lastTag != '' && lastTag != null ? nextTag(lastTag) : `${major}.${minor}.${patch}`
    
    if(lastTag != null && id == null){
        if(`${major}.${minor}.${patch}`.split(/([a-z]|[A-z])+\.*/).pop() == lastTag.split(/([a-z]|[A-z])+\.*/).pop() ){        
            let data_last_release = await getRelease(lastTag)
             last_release =  data_last_release.last_release
             id = data_last_release.id
             fullChange = await getFullChange(data_last_release.body)
             data_last_release.body = data_last_release.body.replace(/\**\Full Changelog\**\:[\s\S]+|feat\(.+\):[\s\S]+/, "").trim()
             data_last_release.body+=  `\n${contentRelease.replace("## What's Changed \n","")}`
             contentRelease = data_last_release.body
         }
    }

    if (lastTag != null ){
        contentRelease += fullChange == '' ? `\n **Full Changelog**: https://github.com/${github.context.payload.repository.owner.name}/${github.context.payload.repository.name}/compare/${last_release}...${nextRelease}\n` : fullChange
    }

    if(id != null){
        let {status} = await updateReleaseNote(last_release, contentRelease, id)
        if(status == 200){
            console.log('Release atualizada!')
            core.setOutput('success','Release atualizada!')
            return
        }else{
            core.setFailed('Erro atualizar release note!')
            return
        }
    }
    
    let {status} = await gerenateReleaseNote(nextRelease, contentRelease)
    if(status == 201){
        console.log('Release note criada!')
        core.setOutput('success','Release criada!')
    }else{
        core.setFailed('Erro ao criada release note!')
    }
}

async function getNumberPullRequestByCommit(commitSha){

    let res = await octokit.request('GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls', {
        owner: github.context.payload.repository.owner.name,
        repo: github.context.payload.repository.name,
        commit_sha: commitSha
    })
    let {number, milestone} = res.data.pop();
    
    return {
        number: number,
        milestone: milestone != null ? milestone.title : null
    }
    
}
async function gerenateReleaseNote(release, content){
    try{
        return await octokit.request('POST /repos/{owner}/{repo}/releases', {
            owner: github.context.payload.repository.owner.name,
            repo: github.context.payload.repository.name,
            tag_name: release,
            target_commitish: github.context.payload.repository.default_branch,
            name: release,
            body: content,
            draft: false,
            prerelease: false,
            generate_release_notes: false
        })
    }catch{
        console.log('Erro ao criar a release!')
        return {status: 422}
    }
    
}

async function updateReleaseNote(release, content, id){
    try{
        return await octokit.request('PATCH /repos/{owner}/{repo}/releases/{release_id}', {
            owner: github.context.payload.repository.owner.name,
            repo: github.context.payload.repository.name,
            release_id: id,
            tag_name: release,
            target_commitish: github.context.payload.repository.default_branch,
            name: release,
            body: content,
            draft: false,
            prerelease: false
        })
    }catch{
        console.log('Erro atualizar Release!')
        return {status: 422}
    }
    
}

function nextTag(lastTag){
    let versions = lastTag.split('.')
    if(versions.length < 3){
        for(let x = versions.length; x < 3; x++){
            versions[x] = '0'
        }
    }
        
        versions[0] = versions[0].split(/([a-z]|[A-z])+\.*/).pop()
        if(major != 0){
            minor = 0
            patch = 0
            versions[1] = 0
            versions[2] = 0
        }
    
        if(major == 0 && minor != 0){
            patch = 0
            versions[2] = 0
        }

        major += Number(versions[0])  
        minor += Number(versions[1]) 
        patch += Number(versions[2])

        return `${major}.${minor}.${patch}`
}

async function findTag(){
    try{
        let param = {
            owner: github.context.payload.repository.owner.name,
            repo: github.context.payload.repository.name
        }
        let res = await octokit.request('GET /repos/{owner}/{repo}/git/refs/tags', param)
        if(res.status == 200)
            return res.data.pop().ref.split('/').pop()
    }catch(error){
        return null
    }
}

function countSemanticRelease(message){
    let length = message.split('\n')
    
    if (isMajor(message, length)) {
        major++
    }

    if (isMinor(message, length)){
        minor++
    }

    if (isPatch(message, length)) {
        patch++
    }

    if(isNotPatchAndNotMinorAndNotMajor(message,length)){
        contentRelease += `- ${message} \n`
    }
}

function isNotPatchAndNotMinorAndNotMajor(message,length){
    return ((/build:[\s\S]+|build\(.+\):[\s\S]+/.test(message) || 
    /chore:[\s\S]+|chore\(.+\):[\s\S]+/.test(message) || /ci:[\s\S]+|ci\(.+\):[\s\S]+/.test(message) || 
    /docs:[\s\S]+|docs\(.+\):[\s\S]+/.test(message) || /style:[\s\S]+|style\(.+\):[\s\S]+/.test(message) ||
    /test:[\s\S]+|test\(.+\):[\s\S]+/.test(message) ||
    /refactor:[\s\S]+|refactor\(.+\):[\s\S]+/.test(message) ||/perf:[\s\S]+|perf\(.+\):[\s\S]+/.test(message)) && minor == 0
    && !(length.length >= 3 && length.pop() != ''))
}

function isMinor(message, length){
    if((/feat:[\s\S]+|feat\(.+\):[\s\S]+/.test(message)) && !(length.length >= 3 && length.pop() != '')){
        contentRelease += `- ${message} \n`
    }

    return ((/feat:[\s\S]+|feat\(.+\):[\s\S]+/.test(message)) && minor == 0 
        && !(length.length >= 3 && length.pop() != ''))
}

function isPatch(message, length){
    if(((/fix:[\s\S]+|fix\(.+\):[\s\S]+/.test(message) || /hotfix:[\s\S]+|hotfix\(.+\):[\s\S]+/.test(message)) && !(length.length >= 3 && length.pop() != ''))){
        contentRelease += `- ${message} \n`
    }

    return ((/fix:[\s\S]+|fix\(.+\):[\s\S]+/.test(message) || /hotfix:[\s\S]+|hotfix\(.+\):[\s\S]+/.test(message)) && patch == 0
        && !(length.length >= 3 && length.pop() != ''))
}

function isMajor(message, length){
    if(/[a-zA-Z]+!:[\s\S]+|[a-zA-Z]+\(.+\)!:[\s\S]+/.test(message) || length.length >= 3 && length.pop() != ''){
        contentRelease += `- ${message} \n`
    }
    
    return (/[a-zA-Z]+!:[\s\S]+|[a-zA-Z]+\(.+\)!:[\s\S]+/.test(message) && major == 0 || length.length >= 3 && length.pop() != '')
}

async function getFullChange(fullChanges){
    let result = ''
    fullChanges.split(`\n`).map((fullChange) => {
        if(/\**\Full Changelog\**\:[\s\S]+|feat\(.+\):[\s\S]+/.test(fullChange)){
            result =  `\n${fullChange}`
            return
        }
    })
    return result
}

async function getCommits(number){
    return octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
        owner: github.context.payload.repository.owner.name,
        repo: github.context.payload.repository.name,
        pull_number: number
    })
}

async function getRelease(milestone){
    let release_milestone = 0
    let body_milestone = ''
    let id_release_milestone
    let number_release = milestone != null? milestone.split(/([a-z]|[A-z])+\.*/).pop() : null
    return octokit.request('GET /repos/{owner}/{repo}/releases', {
        owner: github.context.payload.repository.owner.name,
        repo: github.context.payload.repository.name
    }).then((res)=>{
        let isRelease = false
        if(number_release != null){
            res.data.map(({tag_name, body, id})=>{
                if(tag_name.split(/([a-z]|[A-z])+\.*/).pop() == number_release){
                    release_milestone = tag_name
                    body_milestone = body
                    id_release_milestone = id
                    isRelease = true;
                }
            })
        }
            
        return isRelease ? {status: res.status, last_release: release_milestone, body: body_milestone, id: id_release_milestone } : {status: 404, last_release: res.data[0].tag_name, body:null, id:null}
    }).catch(()=>{            
        return {status: 404, last_release: null, body:null, id:null}
    })

}
run()